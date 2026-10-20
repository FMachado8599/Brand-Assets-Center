import { CAPTION_BOTTOM, MEDIA_BOTTOM, MEDIA_H, MEDIA_TOP, META_SAFE, SCREEN, type AdMedia } from "@/lib/ads/reel";
import type { AdColors } from "@/lib/ads/color";
import { inkOn } from "@/lib/clients/color";
import { BEZEL, BUBBLES, FONT, PHONE, RAIL, captionLine } from "./ReelMockup";
import { FOLLOW_D, PERSON_D, STROKES, type StrokeName } from "./ReelIcons";

/** La foto de perfil: una imagen (subida o el logo de un cliente, con su fondo) o la inicial. */
export type AvatarSource = { url: string; background?: string; pad?: number } | { letter: string; background?: string };

export type ReelImageInput = {
  media: AdMedia;
  /** La imagen o el video que se ve en el teléfono (el video, en el cuadro en que está). */
  source: CanvasImageSource;
  fit: "cover" | "contain";
  account: string;
  avatar: AvatarSource;
  caption: string;
  cta: string;
  colors: AdColors;
  social: boolean;
  showUI: boolean;
  mark: boolean;
  safeZone: boolean;
  time: string;
};

/** Como una captura de iPhone: 3 píxeles por punto. */
const SCALE = 3;

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Los logos vienen de otro dominio: sin permiso (CORS) el canvas no se podría exportar.
    if (!url.startsWith("blob:") && !url.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function fitRect(sw: number, sh: number, x: number, y: number, w: number, h: number, mode: "cover" | "contain", zoom = 1) {
  const k = (mode === "cover" ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh)) * zoom;
  const dw = sw * k;
  const dh = sh * k;
  return [x + (w - dw) / 2, y + (h - dh) / 2, dw, dh] as const;
}

/** Corta el texto con "…" para que entre en el ancho. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

function strokeIcon(ctx: CanvasRenderingContext2D, name: StrokeName, x: number, y: number, size: number) {
  const { d, width } = STROKES[name];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#fff";
  d.forEach((path) => ctx.stroke(new Path2D(path)));
  ctx.restore();
}

function markBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fillStyle = "rgba(239,68,68,.3)";
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x - 1, y - 1, w + 2, h + 2, 7);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ef4444";
  ctx.stroke();
  ctx.restore();
}

function safeZone(ctx: CanvasRenderingContext2D) {
  const top = MEDIA_H * META_SAFE.top;
  const bottom = MEDIA_H * META_SAFE.bottom;
  const side = SCREEN.w * META_SAFE.side;
  const y0 = MEDIA_TOP;
  const zones: [number, number, number, number][] = [
    [0, y0, SCREEN.w, top],
    [0, MEDIA_BOTTOM - bottom, SCREEN.w, bottom],
    [0, y0 + top, side, MEDIA_H - top - bottom],
    [SCREEN.w - side, y0 + top, side, MEDIA_H - top - bottom],
  ];
  ctx.save();
  ctx.beginPath();
  zones.forEach(([x, y, w, h]) => ctx.rect(x, y, w, h));
  ctx.clip();
  ctx.fillStyle = "rgba(250,204,21,.14)";
  ctx.fillRect(0, y0, SCREEN.w, MEDIA_H);
  // Las rayas en diagonal: 6 pt de raya cada 12, como el degradé de la pantalla.
  ctx.strokeStyle = "rgba(250,204,21,.38)";
  ctx.lineWidth = 6;
  for (let i = -MEDIA_H; i < SCREEN.w + MEDIA_H; i += 12 * Math.SQRT2) {
    ctx.beginPath();
    ctx.moveTo(i, y0 + MEDIA_H);
    ctx.lineTo(i + MEDIA_H, y0);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fde047";
  ctx.strokeRect(side + 1, y0 + top + 1, SCREEN.w - side * 2 - 2, MEDIA_H - top - bottom - 2);
  ctx.setLineDash([]);
  ctx.font = font(600, 11);
  const label = "Zona segura de Meta";
  const w = ctx.measureText(label).width + 12;
  ctx.fillStyle = "#fde047";
  ctx.beginPath();
  ctx.roundRect(side + 6, y0 + top + 6, w, 18, 4);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.textBaseline = "middle";
  ctx.fillText(label, side + 12, y0 + top + 15);
  ctx.restore();
}

function statusBar(ctx: CanvasRenderingContext2D, time: string) {
  ctx.save();
  // Notch.
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.roundRect((SCREEN.w - 162) / 2, -20, 162, 52, 20);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = font(600, 17);
  ctx.fillText(time, 57, 29);

  // Señal, 5G y batería, desde x = 279 y centrados en y = 29.
  ctx.textAlign = "left";
  const bars: [number, number, number][] = [[0, 7.5, 4.5], [5, 5, 7], [10, 2.5, 9.5], [15, 0, 12]];
  bars.forEach(([x, y, h], i) => {
    ctx.globalAlpha = i === 3 ? 0.35 : 1;
    ctx.beginPath();
    ctx.roundRect(279 + x, 23 + y, 3, h, 0.8);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.font = font(600, 15);
  ctx.fillText("5G", 303, 29.5);
  const bx = 303 + ctx.measureText("5G").width + 6;
  ctx.save();
  ctx.translate(bx, 22.5);
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, 23, 12, 3.6);
  ctx.stroke();
  ctx.fill(new Path2D("M25 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1S25.8 4.7 25 4.4Z"));
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.roundRect(2.2, 2.2, 16, 8.6, 2.2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

async function drawAvatar(ctx: CanvasRenderingContext2D, avatar: AvatarSource, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#2a3442";
  ctx.fill();
  ctx.clip();
  const img = "url" in avatar ? await loadImage(avatar.url) : null;
  if (img && "url" in avatar) {
    if (avatar.background) {
      ctx.fillStyle = avatar.background;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    const pad = (avatar.pad ?? 0) * r * 2;
    const mode = avatar.background ? "contain" : "cover";
    ctx.drawImage(img, ...fitRect(img.naturalWidth, img.naturalHeight, cx - r + pad, cy - r + pad, r * 2 - pad * 2, r * 2 - pad * 2, mode));
  } else {
    if ("letter" in avatar && avatar.background) {
      ctx.fillStyle = avatar.background;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.fillStyle = "letter" in avatar && avatar.background ? inkOn(avatar.background) : "#fff";
    ctx.font = font(600, 13);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(("letter" in avatar ? avatar.letter : "").toUpperCase(), cx, cy + 0.5);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,.25)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Dibuja el teléfono con el anuncio, igual que en la pantalla, a 3× (1236 × 2598 px). */
export async function renderReelImage(p: ReelImageInput): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = PHONE.w * SCALE;
  canvas.height = PHONE.h * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no dejó dibujar la imagen.");
  ctx.scale(SCALE, SCALE);

  // El teléfono.
  ctx.beginPath();
  ctx.roundRect(0, 0, PHONE.w, PHONE.h, 58);
  ctx.fillStyle = "#0d0d0f";
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(1, 1, PHONE.w - 2, PHONE.h - 2, 57);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#2c2c30";
  ctx.stroke();

  ctx.save();
  ctx.translate(BEZEL, BEZEL);
  ctx.beginPath();
  ctx.roundRect(0, 0, SCREEN.w, SCREEN.h, 47);
  ctx.clip();
  ctx.fillStyle = "#0b1014";
  ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
  ctx.fillStyle = p.colors.band;
  ctx.fillRect(0, 0, SCREEN.w, MEDIA_TOP);
  ctx.fillStyle = p.colors.captionBand;
  ctx.fillRect(0, MEDIA_BOTTOM, SCREEN.w, CAPTION_BOTTOM - MEDIA_BOTTOM);

  // El creativo.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, MEDIA_TOP, SCREEN.w, MEDIA_H);
  ctx.clip();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, MEDIA_TOP, SCREEN.w, MEDIA_H);
  const { width: sw, height: sh } = p.media;
  if (p.fit === "contain") {
    ctx.save();
    ctx.filter = "blur(40px)";
    ctx.globalAlpha = 0.7;
    ctx.drawImage(p.source, ...fitRect(sw, sh, 0, MEDIA_TOP, SCREEN.w, MEDIA_H, "cover", 1.25));
    ctx.restore();
  }
  ctx.drawImage(p.source, ...fitRect(sw, sh, 0, MEDIA_TOP, SCREEN.w, MEDIA_H, p.fit));
  if (p.showUI) {
    const g = ctx.createLinearGradient(0, MEDIA_TOP, 0, MEDIA_BOTTOM);
    g.addColorStop(0, "rgba(0,0,0,.18)");
    g.addColorStop(0.14, "rgba(0,0,0,0)");
    g.addColorStop(0.58, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,.32)");
    ctx.fillStyle = g;
    ctx.fillRect(0, MEDIA_TOP, SCREEN.w, MEDIA_H);
  }
  ctx.restore();

  if (p.safeZone) safeZone(ctx);
  statusBar(ctx, p.time);

  if (p.showUI) {
    strokeIcon(ctx, "back", 24, 70, 26);
    RAIL.forEach(({ y, name }) => strokeIcon(ctx, name, 344, y - 15, 30));

    if (p.social) {
      for (const b of BUBBLES) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, 22, 0, Math.PI * 2);
        const g = ctx.createLinearGradient(b.x - 8, b.y - 22, b.x + 8, b.y + 22);
        g.addColorStop(0, b.tone);
        g.addColorStop(1, "#3b3f46");
        ctx.fillStyle = g;
        ctx.fill();
        ctx.clip();
        ctx.translate(b.x - 18, b.y - 14);
        ctx.scale(36 / 24, 36 / 24);
        ctx.fillStyle = "rgba(255,255,255,.7)";
        PERSON_D.forEach((d) => ctx.fill(new Path2D(d)));
        ctx.restore();

        const bx = b.x + 16.5;
        const by = b.y + 17.5;
        ctx.beginPath();
        ctx.arc(bx, by, 12, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,.8)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx, by, 10.5, 0, Math.PI * 2);
        ctx.fillStyle = "#696ddb";
        ctx.fill();
        ctx.save();
        ctx.translate(bx - 6.5, by - 6.5);
        ctx.scale(13 / 24, 13 / 24);
        ctx.fillStyle = "#fff";
        FOLLOW_D.fill.forEach((d) => ctx.fill(new Path2D(d)));
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2.4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke(new Path2D(FOLLOW_D.check));
        ctx.restore();
      }
    }

    // El botón.
    ctx.beginPath();
    ctx.roundRect(16, 612, 307, 46, 9);
    ctx.fillStyle = p.colors.cta;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = font(600, 15.5);
    ctx.textBaseline = "middle";
    ctx.fillText(ellipsize(ctx, p.cta, 307 - 16 - 12 - 26), 32, 635.5);
    strokeIcon(ctx, "chevron", 291, 625, 20);

    // La cuenta.
    await drawAvatar(ctx, p.avatar, 33.75, 695, 17.75);
    ctx.fillStyle = "#fff";
    ctx.font = font(600, 16);
    ctx.textBaseline = "middle";
    const name = ellipsize(ctx, p.account || "tu.marca", 320 - 35.5 - 8.5);
    ctx.fillText(name, 60, 695.5);
    const nameWidth = ctx.measureText(name).width;

    // El texto y "Publicidad", y la barra de comentarios.
    ctx.font = font(400, 15);
    ctx.fillText(captionLine(p.caption, true), 16, 733.5);
    ctx.font = font(600, 15);
    ctx.textAlign = "right";
    ctx.fillText("Publicidad", SCREEN.w - 17, 733.5);
    ctx.textAlign = "left";
    ctx.beginPath();
    ctx.roundRect(16, 771, 358, 46, 23);
    ctx.fillStyle = "#181c1f";
    ctx.fill();
    ctx.fillStyle = "#b2b3b5";
    ctx.font = font(400, 17);
    ctx.fillText("Agrega un comentario...", 36, 794.5);

    if (p.mark) {
      markBox(ctx, 24, 70, 26, 26);
      markBox(ctx, 342, 489, 34, 222);
      if (p.social) markBox(ctx, 14, 535, 198, 69);
      markBox(ctx, 16, 612, 307, 46);
      markBox(ctx, 16, 677, Math.min(320, 35.5 + 8.5 + nameWidth), 36);
    }
  }
  ctx.restore();
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo armar la imagen."))), "image/png")
  );
}
