import type { AdColors } from "@/lib/ads/color";
import { frameOf, type Frame, type Placement } from "@/lib/ads/placements";
import { SCREEN, type AdMedia } from "@/lib/ads/reel";
import { RAIL, railBox, textCollisions, zonesOf, type Rect, type TextBox } from "@/lib/ads/safe";
import { UI_TEXT, type Lang } from "@/lib/ads/text";
import { inkOn } from "@/lib/clients/color";
import { FOLLOW_D, PERSON_D, STROKES, WORDMARK, type StrokeName } from "./icons";

/**
 * Todos los mockups se dibujan acá, en un canvas, en puntos de un iPhone de 390 × 844 pt. En pantalla el
 * creativo va en un <img>/<video> debajo (el canvas le deja el hueco) y al descargar se dibuja adentro: las
 * dos cosas salen del mismo dibujo. Las medidas están tomadas de capturas reales (ver README, "Ads").
 */

export const BEZEL = 11;
export const PHONE = { w: SCREEN.w + BEZEL * 2, h: SCREEN.h + BEZEL * 2 };

/** Las tipografías del sistema: en un iPhone es SF Pro, como en Instagram. */
export const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif';

/** La foto de perfil: una imagen (subida o el logo de un cliente, con su fondo) o la inicial. */
export type AvatarSource = { url: string; background?: string; pad?: number } | { letter: string; background?: string };

export type MockupInput = {
  placement: Placement;
  media: AdMedia | null;
  /** El creativo para dibujar adentro; null deja el hueco transparente (en pantalla va el <img>/<video> debajo). */
  source: CanvasImageSource | null;
  /** Un cuadro quieto del creativo, para la miniatura de la tarjeta de Reels. */
  thumb: CanvasImageSource | null;
  fit: "cover" | "contain";
  account: string;
  avatar: AvatarSource;
  /** La foto de perfil ya cargada (si es una imagen). */
  avatarImg: HTMLImageElement | null;
  caption: string;
  /** El título del anuncio (la tarjeta de la pestaña Reels). */
  headline: string;
  /** El texto del botón, ya en el idioma. */
  cta: string;
  lang: Lang;
  colors: AdColors;
  social: boolean;
  showUI: boolean;
  mark: boolean;
  safeZone: boolean;
  time: string;
  /** En un carrusel: qué tarjeta es y cuántas hay. */
  card?: { index: number; total: number };
  /** Los textos encontrados en el creativo (null: todavía no se buscaron, o el aviso se ignoró). */
  texts: TextBox[] | null;
  /** Marcar en rojo los textos que caen donde no es seguro. */
  textCheck: boolean;
};

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

export function loadImage(url: string): Promise<HTMLImageElement | null> {
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

function sizeOf(src: CanvasImageSource): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight];
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
  const s = src as { width: number; height: number };
  return [s.width, s.height];
}

/** Corta el texto con "…" para que entre en el ancho. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, weight: number, size: number, align: CanvasTextAlign = "left", color = "#fff") {
  ctx.font = font(weight, size);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

/** Un ícono de trazo, centrado en (cx, cy). */
function icon(ctx: CanvasRenderingContext2D, name: StrokeName, cx: number, cy: number, size: number, color = "#fff") {
  const { d, width } = STROKES[name];
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  d.forEach((path) => ctx.stroke(new Path2D(path)));
  ctx.restore();
}

function dots(ctx: CanvasRenderingContext2D, cx: number, cy: number, gap: number, r: number) {
  ctx.fillStyle = "#fff";
  for (const dx of [-gap, 0, gap]) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
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

/* ───────────── Lo común ───────────── */

function drawMedia(ctx: CanvasRenderingContext2D, p: MockupInput, f: Frame) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, f.top, SCREEN.w, f.height, f.radius);
  if (!p.source) {
    // En pantalla el creativo va debajo: acá queda el hueco.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.clip();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, f.top, SCREEN.w, f.height);
  const [sw, sh] = p.media ? [p.media.width, p.media.height] : sizeOf(p.source);
  if (p.fit === "contain") {
    // Fuera del 9:16, de fondo el mismo creativo desenfocado (como en pantalla).
    ctx.save();
    ctx.filter = "blur(40px)";
    ctx.globalAlpha = 0.7;
    ctx.drawImage(p.source, ...fitRect(sw, sh, 0, f.top, SCREEN.w, f.height, "cover", 1.25));
    ctx.restore();
  }
  ctx.drawImage(p.source, ...fitRect(sw, sh, 0, f.top, SCREEN.w, f.height, p.fit));
  ctx.restore();
}

/** Los degradés que pone Instagram para que se lea lo de encima. */
function shade(ctx: CanvasRenderingContext2D, f: Frame, stops: [number, string][]) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, f.top, SCREEN.w, f.height, f.radius);
  ctx.clip();
  const g = ctx.createLinearGradient(0, f.top, 0, f.top + f.height);
  stops.forEach(([at, color]) => g.addColorStop(at, color));
  ctx.fillStyle = g;
  ctx.fillRect(0, f.top, SCREEN.w, f.height);
  ctx.restore();
}

/** Lo que no es seguro, rayado en amarillo: las bandas de Meta y, en Reels, la columna de íconos (ver lib/ads/safe). */
function safeZone(ctx: CanvasRenderingContext2D, p: MockupInput, f: Frame) {
  const zones = zonesOf(p.placement, p.media);
  if (!zones) return;
  const y0 = f.top;
  ctx.save();
  ctx.beginPath();
  zones.unsafe.forEach((r) => ctx.rect(r.x, r.y, r.w, r.h));
  ctx.clip();
  ctx.fillStyle = "rgba(250,204,21,.14)";
  ctx.fillRect(0, y0, SCREEN.w, f.height);
  // Rayas en diagonal: 6 pt de raya cada 12.
  ctx.strokeStyle = "rgba(250,204,21,.38)";
  ctx.lineWidth = 6;
  for (let i = -f.height; i < SCREEN.w + f.height; i += 12 * Math.SQRT2) {
    ctx.beginPath();
    ctx.moveTo(i, y0 + f.height);
    ctx.lineTo(i + f.height, y0);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fde047";
  ctx.beginPath();
  zones.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = font(600, 11);
  const label = railBox(p.placement) ? "Zona segura: Meta + íconos de Reels" : "Zona segura de Meta";
  const w = ctx.measureText(label).width + 12;
  const [x0, top] = zones.outline[0];
  ctx.fillStyle = "#fde047";
  ctx.beginPath();
  ctx.roundRect(x0 + 6, top + 6, w, 18, 4);
  ctx.fill();
  text(ctx, label, x0 + 12, top + 15, 600, 11, "left", "#000");
  ctx.restore();
}

/** Los íconos del costado de Reels, cada uno con su número abajo (el ⋯ no tiene). Medidas en RAIL. */
function rail(ctx: CanvasRenderingContext2D, p: MockupInput, placement: "reels" | "reels-feed") {
  const r = RAIL[placement];
  const counts = UI_TEXT[p.lang].counts;
  (["heart", "comment", "repost", "share"] as const).forEach((name, i) => {
    icon(ctx, name, r.x, r.items[i], r.sizes[i]);
    text(ctx, counts[i], r.x, r.items[i] + r.countDy, 600, r.font, "center");
  });
  if (placement === "reels") dots(ctx, r.x, r.more, 5.6, 1.6);
  else icon(ctx, "more", r.x, r.more, r.moreSize);
}

/** Un texto del creativo que cae donde no es seguro (ver textCollisions). */
function textHit(ctx: CanvasRenderingContext2D, r: Rect) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 4);
  ctx.fillStyle = "rgba(239,68,68,.25)";
  ctx.fill();
  ctx.shadowColor = "rgba(239,68,68,.8)";
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ef4444";
  ctx.stroke();
  ctx.restore();
}

function statusBar(ctx: CanvasRenderingContext2D, time: string) {
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.roundRect((SCREEN.w - 162) / 2, -20, 162, 52, 20);
  ctx.fill();
  text(ctx, time, 57, 29, 600, 17, "center");
  // Señal, 5G y batería, desde x = 279 y centrados en y = 29.
  ctx.fillStyle = "#fff";
  const bars: [number, number, number][] = [[0, 7.5, 4.5], [5, 5, 7], [10, 2.5, 9.5], [15, 0, 12]];
  bars.forEach(([x, y, h], i) => {
    ctx.globalAlpha = i === 3 ? 0.35 : 1;
    ctx.beginPath();
    ctx.roundRect(279 + x, 23 + y, 3, h, 0.8);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  text(ctx, "5G", 303, 29.5, 600, 15);
  const bx = 303 + ctx.measureText("5G").width + 6;
  ctx.translate(bx, 22.5);
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, 23, 12, 3.6);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fill(new Path2D("M25 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1S25.8 4.7 25 4.4Z"));
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.roundRect(2.2, 2.2, 16, 8.6, 2.2);
  ctx.fill();
  ctx.restore();
}

function drawAvatar(ctx: CanvasRenderingContext2D, p: MockupInput, cx: number, cy: number, r: number) {
  const { avatar, avatarImg: img } = p;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#2a3442";
  ctx.fill();
  ctx.clip();
  if (img && "url" in avatar) {
    if (avatar.background) {
      ctx.fillStyle = avatar.background;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    const pad = (avatar.pad ?? 0) * r * 2;
    const mode = avatar.background ? "contain" : "cover";
    ctx.drawImage(img, ...fitRect(img.naturalWidth, img.naturalHeight, cx - r + pad, cy - r + pad, r * 2 - pad * 2, r * 2 - pad * 2, mode));
  } else {
    if (avatar.background) {
      ctx.fillStyle = avatar.background;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    const letter = "letter" in avatar ? avatar.letter : p.account.slice(0, 1);
    text(ctx, letter.toUpperCase(), cx, cy + 0.5, 600, r * 0.73, "center", avatar.background ? inkOn(avatar.background) : "#fff");
  }
  ctx.restore();
}

/* ───────────── Reels desde el feed (captura de Changan, 923 × 2000 px) ───────────── */

/** Las caras de las burbujas (centro y tono): la del medio va más arriba. */
const BUBBLES = [
  { x: 37, y: 572, tone: "#7d8b99" },
  { x: 100, y: 558, tone: "#9c8b7a" },
  { x: 160, y: 573, tone: "#8a9483" },
];

/** La primera línea del texto, cortada en la última palabra que entra, con " ..." si queda algo. */
function oneLine(ctx: CanvasRenderingContext2D, caption: string, max: number) {
  const lines = caption.trim().split("\n");
  const first = lines[0].trim();
  if (lines.length === 1 && ctx.measureText(first).width <= max) return first;
  let out = "";
  for (const word of first.split(/\s+/)) {
    const next = out ? `${out} ${word}` : word;
    if (ctx.measureText(`${next} ...`).width > max) break;
    out = next;
  }
  return `${out} ...`;
}

function reelsFeed(ctx: CanvasRenderingContext2D, p: MockupInput, f: Frame) {
  const t = UI_TEXT[p.lang];
  const bottom = f.top + f.height;
  ctx.fillStyle = p.colors.band;
  ctx.fillRect(0, 0, SCREEN.w, f.top);
  ctx.fillStyle = p.colors.captionBand;
  ctx.fillRect(0, bottom, SCREEN.w, 762 - bottom);
  drawMedia(ctx, p, f);
  if (p.showUI) {
    shade(ctx, f, [[0, "rgba(0,0,0,.18)"], [0.14, "rgba(0,0,0,0)"], [0.58, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.32)"]]);
  }
  if (p.safeZone) safeZone(ctx, p, f);
  statusBar(ctx, p.time);
  if (!p.showUI) return;

  icon(ctx, "back", 37, 83, 26);
  rail(ctx, p, "reels-feed");

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

  ctx.beginPath();
  ctx.roundRect(16, 612, 307, 46, 9);
  ctx.fillStyle = p.colors.cta;
  ctx.fill();
  ctx.font = font(600, 15.5);
  text(ctx, ellipsize(ctx, p.cta, 307 - 16 - 12 - 26), 32, 635.5, 600, 15.5);
  icon(ctx, "chevron", 301, 635, 20);

  drawAvatar(ctx, p, 33.75, 695, 17.75);
  ctx.beginPath();
  ctx.arc(33.75, 695, 18.25, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,.25)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = font(600, 16);
  const name = ellipsize(ctx, p.account || "tu.marca", 320 - 35.5 - 8.5);
  text(ctx, name, 60, 695.5, 600, 16);
  const nameWidth = ctx.measureText(name).width;

  ctx.font = font(600, 15);
  const adWidth = ctx.measureText(t.ad).width;
  ctx.font = font(400, 15);
  text(ctx, oneLine(ctx, p.caption, SCREEN.w - 16 - 17 - 12 - adWidth), 16, 733.5, 400, 15);
  text(ctx, t.ad, SCREEN.w - 17, 733.5, 600, 15, "right");
  ctx.beginPath();
  ctx.roundRect(16, 771, 358, 46, 23);
  ctx.fillStyle = "#181c1f";
  ctx.fill();
  text(ctx, t.comment, 36, 794.5, 400, 17, "left", "#b2b3b5");

  if (p.mark) {
    markBox(ctx, 24, 70, 26, 26);
    const r = railBox("reels-feed")!;
    markBox(ctx, r.x, r.y, r.w, r.h);
    if (p.social) markBox(ctx, 14, 535, 198, 69);
    markBox(ctx, 16, 612, 307, 46);
    markBox(ctx, 16, 677, Math.min(320, 35.5 + 8.5 + nameWidth), 36);
  }
}

/* ───────────── Reels en la pestaña Reels (captura de Jetour, 738 × 1600 px) ───────────── */

/** La barra de abajo de Instagram (inicio, Reels, mensajes, buscar, perfil), con la pestaña en la que se está. */
function tabBar(ctx: CanvasRenderingContext2D, active: "home" | "reels") {
  const y = 792.3;
  ctx.fillStyle = "#0b1014";
  ctx.fillRect(0, 770, SCREEN.w, SCREEN.h - 770);
  ctx.fillStyle = "#1c2024";
  ctx.fillRect(0, 770, SCREEN.w, 0.6);
  if (active === "home") {
    ctx.save();
    ctx.translate(38.9 - 11, y - 11);
    ctx.scale(22 / 24, 22 / 24);
    ctx.fillStyle = "#fff";
    ctx.fill(new Path2D(STROKES.home.d[0]));
    ctx.restore();
    icon(ctx, "reelsTab", 116.8, y, 22);
  } else {
    icon(ctx, "home", 38.9, y, 22);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(116.8 - 10, y - 10, 20, 20, 5.5);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(114.6, y - 4.9);
    ctx.lineTo(121.4, y);
    ctx.lineTo(114.6, y + 4.9);
    ctx.closePath();
    ctx.fillStyle = "#0b1014";
    ctx.fill();
    ctx.restore();
  }
  icon(ctx, "share", 195, y, 22);
  icon(ctx, "search", 272.7, y, 22);
  ctx.save();
  ctx.beginPath();
  ctx.arc(350.4, y, 10.5, 0, Math.PI * 2);
  ctx.fillStyle = "#5b6470";
  ctx.fill();
  ctx.clip();
  ctx.translate(350.4 - 9, y - 7);
  ctx.scale(18 / 24, 18 / 24);
  ctx.fillStyle = "rgba(255,255,255,.8)";
  PERSON_D.forEach((d) => ctx.fill(new Path2D(d)));
  ctx.restore();
  for (const [x, dy] of [[206, 7.7], [361, 8.3]]) {
    ctx.beginPath();
    ctx.arc(x, y + dy, 3.1, 0, Math.PI * 2);
    ctx.fillStyle = "#ff3040";
    ctx.fill();
  }
}

const IG_RING = ["#feda75", "#fa7e1e", "#d62976", "#962fbf", "#4f5bd5"];

/** Las dos líneas del texto: la primera hasta donde entra y la segunda con " ..." y «Publicidad» en negrita. */
function twoLines(ctx: CanvasRenderingContext2D, caption: string, max: number, adWidth: number) {
  const paras = caption.trim().split("\n").map((s) => s.trim()).filter(Boolean);
  if (!paras.length) return { first: "", second: "", more: false, cut: false };
  const words = paras[0].split(/\s+/);
  let first = "";
  let i = 0;
  for (; i < words.length; i++) {
    const next = first ? `${first} ${words[i]}` : words[i];
    if (ctx.measureText(next).width > max && first) break;
    first = next;
  }
  const rest = [...words.slice(i), ...paras.slice(1).join(" ").split(/\s+/).filter(Boolean)];
  let second = "";
  let j = 0;
  for (; j < rest.length; j++) {
    const next = second ? `${second} ${rest[j]}` : rest[j];
    if (ctx.measureText(`${next} ...`).width + 4 + adWidth > max) break;
    second = next;
  }
  /** more: hay texto después de la primera línea; cut: no entra todo en la segunda. */
  return { first, second, more: rest.length > 0, cut: j < rest.length };
}

function reelsTab(ctx: CanvasRenderingContext2D, p: MockupInput, f: Frame) {
  const t = UI_TEXT[p.lang];
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
  drawMedia(ctx, p, f);
  if (p.showUI) shade(ctx, f, [[0, "rgba(0,0,0,.12)"], [0.12, "rgba(0,0,0,0)"], [0.55, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.45)"]]);
  if (p.safeZone) safeZone(ctx, p, f);

  tabBar(ctx, "reels");

  statusBar(ctx, p.time);
  if (!p.showUI) return;

  rail(ctx, p, "reels");

  // La tarjeta: miniatura y título, y el botón pegado abajo.
  ctx.beginPath();
  ctx.roundRect(14.8, 538, 314, 72.5, [10, 10, 0, 0]);
  ctx.fillStyle = "rgba(46,46,46,.88)";
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(29, 552.3, 43.4, 43.4, 4.5);
  ctx.fillStyle = "#222";
  ctx.fill();
  ctx.clip();
  const thumb = p.thumb ?? p.source;
  if (thumb) {
    const [tw, th] = p.media ? [p.media.width, p.media.height] : sizeOf(thumb);
    ctx.drawImage(thumb, ...fitRect(tw, th, 29, 552.3, 43.4, 43.4, "cover"));
  }
  ctx.restore();
  ctx.font = font(400, 11);
  text(ctx, ellipsize(ctx, p.headline || "Título del anuncio", 328.8 - 84.6 - 12), 84.6, 573, 400, 11);
  ctx.beginPath();
  ctx.roundRect(14.8, 610.5, 314, 42.2, [0, 0, 10, 10]);
  ctx.fillStyle = p.colors.cta;
  ctx.fill();
  ctx.font = font(600, 11.5);
  text(ctx, ellipsize(ctx, p.cta, 314 - 30 - 40), 30.1, 631.6, 600, 11.5);
  icon(ctx, "chevron", 311.6, 631.6, 17);

  // La cuenta, con el anillo de historia.
  const ring = ctx.createLinearGradient(34.4 - 19, 689.7 + 19, 34.4 + 19, 689.7 - 19);
  IG_RING.forEach((c, i) => ring.addColorStop(i / (IG_RING.length - 1), c));
  ctx.beginPath();
  ctx.arc(34.4, 689.7, 18.4, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 2.3;
  ctx.stroke();
  drawAvatar(ctx, p, 34.4, 689.7, 15.6);
  ctx.font = font(600, 10.5);
  const name = ellipsize(ctx, p.account || "tu.marca", 280);
  text(ctx, name, 61.8, 689.7, 600, 10.5);
  const nameWidth = ctx.measureText(name).width;

  // El texto: dos líneas, la segunda termina en « ... Publicidad» (en negrita).
  ctx.font = font(600, 11.3);
  const adWidth = ctx.measureText(t.ad).width;
  ctx.font = font(400, 11.3);
  const { first, second, more, cut } = twoLines(ctx, p.caption, 314, adWidth);
  const firstWidth = ctx.measureText(first).width;
  text(ctx, first, 15.9, 725.5, 400, 11.3);
  let adX = 15.9 + firstWidth + ctx.measureText(" ").width;
  let adY = 725.5;
  if (more || adX + adWidth > 15.9 + 314) {
    const tail = `${second}${cut ? (second ? " ..." : "...") : ""} `;
    text(ctx, tail, 15.9, 743, 400, 11.3);
    adX = 15.9 + ctx.measureText(tail).width;
    adY = 743;
  }
  text(ctx, t.ad, adX, adY, 600, 11.3);

  if (p.mark) {
    const r = railBox("reels")!;
    markBox(ctx, r.x, r.y, r.w, r.h);
    markBox(ctx, 14.8, 538, 314, 114.7);
    markBox(ctx, 14, 669.5, Math.min(300, 47.8 + nameWidth + 6), 40.5);
    if (first) markBox(ctx, 14.8, 719, firstWidth + 2, Math.min(13, f.top + f.height - 719));
  }
}

/* ───────────── Historias (capturas de Leapmotor y Changan, 738 × 1600 px) ───────────── */

function storyFrame(ctx: CanvasRenderingContext2D, p: MockupInput, f: Frame) {
  ctx.fillStyle = "#0b1014";
  ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
  drawMedia(ctx, p, f);
  if (p.showUI) shade(ctx, f, [[0, "rgba(0,0,0,.3)"], [0.16, "rgba(0,0,0,0)"], [0.8, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.18)"]]);
  if (p.safeZone) safeZone(ctx, p, f);
  statusBar(ctx, p.time);
}

/** El sticker blanco del enlace, con el ícono azul. Devuelve su caja. */
function sticker(ctx: CanvasRenderingContext2D, label: string, top: number) {
  let size = 25;
  ctx.font = font(400, size);
  let width = ctx.measureText(label).width;
  // Los textos largos se achican para que el sticker entre en la pantalla.
  if (width + 54 > 340) {
    size = Math.max(14, (size * (340 - 54)) / width);
    ctx.font = font(400, size);
    width = ctx.measureText(label).width;
  }
  const w = width + 54;
  const x = (SCREEN.w - w) / 2;
  const h = 42.5;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.18)";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.roundRect(x, top, w, h, 12);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();
  icon(ctx, "link", x + 12 + 10.5, top + h / 2, 21, "#1d9bf0");
  text(ctx, label, x + 12 + 21 + 9, top + h / 2 + 0.5, 400, size, "left", "#262626");
  return [x, top, w, h] as const;
}

function story(ctx: CanvasRenderingContext2D, p: MockupInput, f: Frame) {
  const t = UI_TEXT[p.lang];
  storyFrame(ctx, p, f);
  if (!p.showUI) return;

  // Arriba: la barra de progreso (una por tarjeta si es un carrusel), la cuenta, "⋯" y la cruz.
  const total = p.card?.total ?? 1;
  const current = p.card?.index ?? 0;
  const gap = 4;
  const seg = (375.2 - gap * (total - 1)) / total;
  for (let i = 0; i < total; i++) {
    const x = 7.4 + i * (seg + gap);
    ctx.fillStyle = "rgba(255,255,255,.38)";
    ctx.beginPath();
    ctx.roundRect(x, 60.4, seg, 1.8, 1);
    ctx.fill();
    const done = i < current ? seg : i === current ? Math.min(seg, 46) : 0;
    if (!done) continue;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.roundRect(x, 60.4, done, 1.8, 1);
    ctx.fill();
  }
  drawAvatar(ctx, p, 25.4, 84.3, 13.75);
  ctx.font = font(600, 10.5);
  const name = ellipsize(ctx, p.account || "tu.marca", 250);
  text(ctx, name, 51.8, 84.3, 600, 10.5);
  dots(ctx, 335, 84.3, 5.2, 1.25);
  icon(ctx, "close", 371.5, 84.3, 18);

  const box = sticker(ctx, p.cta, 631);

  if (p.placement === "story-lead") {
    const chips: [number, number, StrokeName, string][] = [
      [58.7, 131.6, "close", t.notInterested],
      [197.1, 133.8, "check", t.interested],
    ];
    for (const [x, w, glyph, label] of chips) {
      ctx.beginPath();
      ctx.roundRect(x, 709, w, 28.7, 5);
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.fill();
      ctx.font = font(600, 10.5);
      const tw = ctx.measureText(label).width;
      const start = x + (w - (10 + 5 + tw)) / 2;
      icon(ctx, glyph, start + 5, 723.3, 10);
      text(ctx, label, start + 15, 723.6, 600, 10.5);
    }
  }

  if (p.placement === "story-form") {
    text(ctx, t.swipe, SCREEN.w / 2, 788, 400, 12, "center");
  } else {
    text(ctx, t.ad, 20.6, 785.2, 400, 10.5);
    icon(ctx, "heart", 326.2, 786.5, 25);
    icon(ctx, "comment", 364.7, 786.5, 24);
  }

  if (p.mark) {
    markBox(ctx, 4, 56, 382, 44);
    markBox(ctx, ...box);
    if (p.placement === "story-lead") markBox(ctx, 58.7, 709, 272.2, 28.7);
  }
}

/* ───────────── Feed (inicio) ───────────── */

let wordmarkPath: Path2D | null = null;

/** El logo de Instagram en blanco: `x` es su borde izquierdo y `cy` la mitad de la altura de las mayúsculas. */
function wordmark(ctx: CanvasRenderingContext2D, x: number, cy: number, width: number) {
  wordmarkPath ??= new Path2D(WORDMARK.d);
  const k = width / WORDMARK.w;
  ctx.save();
  ctx.translate(x, cy - (WORDMARK.baseline * k) / 2);
  ctx.scale(k, k);
  ctx.fillStyle = "#fff";
  ctx.fill(wordmarkPath);
  ctx.restore();
}

/** El texto del feed: la cuenta en negrita y lo que entra en dos líneas; si queda algo, " ... más" en gris. */
function feedCaption(ctx: CanvasRenderingContext2D, p: MockupInput, y: number, more: string) {
  const max = SCREEN.w - 28;
  const account = p.account || "tu.marca";
  ctx.font = font(600, 13.5);
  const accountWidth = ctx.measureText(`${account} `).width;
  ctx.font = font(400, 13.5);
  const moreWidth = ctx.measureText(` ... ${more}`).width;
  const words = p.caption.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [""];
  let i = 0;
  for (; i < words.length; i++) {
    const line = lines.length - 1;
    const room = max - (line === 0 ? accountWidth : 0) - (line === 1 ? moreWidth : 0);
    const next = lines[line] ? `${lines[line]} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= room) {
      lines[line] = next;
      continue;
    }
    if (line === 1) break;
    lines.push(words[i]);
  }
  const cut = i < words.length;
  text(ctx, account, 14, y, 600, 13.5);
  text(ctx, lines[0], 14 + accountWidth, y, 400, 13.5);
  if (lines[1] !== undefined) {
    text(ctx, lines[1], 14, y + 18, 400, 13.5);
    if (cut) {
      ctx.font = font(400, 13.5);
      const w = ctx.measureText(lines[1]).width;
      text(ctx, " ...", 14 + w, y + 18, 400, 13.5);
      text(ctx, more, 14 + w + ctx.measureText(" ... ").width, y + 18, 400, 13.5, "left", "#a8a8a8");
    }
  }
}

function feed(ctx: CanvasRenderingContext2D, p: MockupInput, f: Frame) {
  const t = UI_TEXT[p.lang];
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);

  // Arriba: el logo de Instagram, me gusta y mensajes.
  wordmark(ctx, 15, 70, 104);
  icon(ctx, "heart", 329, 69, 26);
  icon(ctx, "share", 366, 69, 25);

  // La cuenta, con «Publicidad» abajo.
  drawAvatar(ctx, p, 30, 118, 16);
  ctx.font = font(600, 13.5);
  text(ctx, ellipsize(ctx, p.account || "tu.marca", 280), 54, 110, 600, 13.5);
  text(ctx, t.sponsored, 54, 127, 400, 12);
  dots(ctx, 368, 118, 4.6, 1.5);

  drawMedia(ctx, p, f);
  const bottom = f.top + f.height;

  // En un carrusel: "2/5" arriba a la derecha.
  const total = p.card?.total ?? 1;
  const current = p.card?.index ?? 0;
  let badge: [number, number, number, number] | null = null;
  if (p.showUI && total > 1) {
    const label = `${current + 1}/${total}`;
    ctx.font = font(500, 12);
    const w = ctx.measureText(label).width + 18;
    badge = [SCREEN.w - 14 - w, f.top + 14, w, 24];
    ctx.beginPath();
    ctx.roundRect(...badge, 12);
    ctx.fillStyle = "rgba(18,18,18,.72)";
    ctx.fill();
    text(ctx, label, SCREEN.w - 14 - w / 2, f.top + 26, 500, 12, "center");
  }

  // La barra del botón, debajo del creativo.
  ctx.fillStyle = p.colors.cta;
  ctx.fillRect(0, bottom, SCREEN.w, 44);
  ctx.font = font(600, 14);
  text(ctx, ellipsize(ctx, p.cta, SCREEN.w - 70), 14, bottom + 22, 600, 14);
  icon(ctx, "chevron", SCREEN.w - 20, bottom + 22, 17);

  // Me gusta, comentar, enviar, guardar; en un carrusel, los puntitos al medio.
  const ay = bottom + 44 + 24;
  icon(ctx, "heart", 27, ay, 27);
  icon(ctx, "comment", 66, ay, 25);
  icon(ctx, "share", 104, ay, 25);
  icon(ctx, "bookmark", SCREEN.w - 25, ay, 25);
  if (total > 1) {
    const shown = Math.min(total, 10);
    const step = 7;
    const start = SCREEN.w / 2 - ((shown - 1) * step) / 2;
    for (let i = 0; i < shown; i++) {
      ctx.beginPath();
      ctx.arc(start + i * step, ay, i === current ? 3 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = i === current ? "#0095f6" : "#5e5e5e";
      ctx.fill();
    }
  }
  text(ctx, t.likes, 14, ay + 32, 600, 13.5);
  feedCaption(ctx, p, ay + 52, t.more);

  if (p.safeZone) safeZoneNote(ctx, f);
  tabBar(ctx, "home");
  statusBar(ctx, p.time);

  if (p.mark && badge) markBox(ctx, ...badge);
}

/** En el feed no hay zona segura de Meta: nada va encima del creativo (salvo el "1/5" de los carruseles). */
function safeZoneNote(ctx: CanvasRenderingContext2D, f: Frame) {
  ctx.save();
  ctx.font = font(600, 11);
  const label = "En el feed no tapa nada: la zona segura es para 9:16";
  const w = ctx.measureText(label).width + 12;
  ctx.fillStyle = "#fde047";
  ctx.beginPath();
  ctx.roundRect(14, f.top + 14, w, 18, 4);
  ctx.fill();
  text(ctx, label, 20, f.top + 23, 600, 11, "left", "#000");
  ctx.restore();
}

/** Dibuja un mockup entero (teléfono, pantalla y todo lo de Instagram) en puntos: quien llama pone la escala. */
export function drawMockup(ctx: CanvasRenderingContext2D, p: MockupInput) {
  const f = frameOf(p.placement, p.media);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, PHONE.w, PHONE.h, 58);
  ctx.fillStyle = "#0d0d0f";
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(1, 1, PHONE.w - 2, PHONE.h - 2, 57);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#2c2c30";
  ctx.stroke();

  ctx.translate(BEZEL, BEZEL);
  ctx.beginPath();
  ctx.roundRect(0, 0, SCREEN.w, SCREEN.h, 47);
  ctx.clip();
  if (p.placement === "reels-feed") {
    ctx.fillStyle = "#0b1014";
    ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
    reelsFeed(ctx, p, f);
  } else if (p.placement === "reels") {
    reelsTab(ctx, p, f);
  } else if (p.placement === "feed") {
    feed(ctx, p, f);
  } else {
    story(ctx, p, f);
  }
  if (p.textCheck && p.texts?.length) textCollisions(p.placement, p.media, p.fit, p.texts).forEach((r) => textHit(ctx, r));
  ctx.restore();
}

/** Como una captura de iPhone: 3 píxeles por punto (1236 × 2598 px). */
const EXPORT_SCALE = 3;

export async function renderMockupPng(p: MockupInput & { source: CanvasImageSource }): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = PHONE.w * EXPORT_SCALE;
  canvas.height = PHONE.h * EXPORT_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no dejó dibujar la imagen.");
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  drawMockup(ctx, p);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo armar la imagen."))), "image/png")
  );
}

/**
 * Lo que se dibuja de un creativo: la imagen o, de un video, un cuadro de adentro (el primero suele ser negro),
 * el mismo del que salen sus colores.
 */
export function mediaFrame(media: AdMedia): Promise<CanvasImageSource> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error(`No se pudo abrir ${media.name}.`));
    if (media.kind === "image") {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = fail;
      img.src = media.url;
      return;
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 3);
    };
    video.onseeked = () => resolve(video);
    video.onerror = fail;
    video.src = media.url;
  });
}
