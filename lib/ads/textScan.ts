import type { AdMedia } from "./reel";
import type { TextBox } from "./safe";

/**
 * Busca texto en un creativo, sin IA: las letras dejan muchos bordes verticales seguidos y parejos en una
 * misma línea (trazo, hueco, trazo…), cosa que una foto casi nunca tiene. Es la idea del "Validador de
 * márgenes" de Meta Reels, con filtros para que las texturas (pasto, rejas, tela) no cuenten como texto.
 * Puede equivocarse: por eso cada aviso se puede ignorar.
 *
 * Trabaja sobre el creativo achicado a 360 px de ancho (rápido y alcanza para letras de más de ~20 px en un
 * 1080). Devuelve cada renglón como una caja en fracciones del creativo (0 a 1).
 */

const W = 360;
/** Cuánto tiene que cambiar el color de un píxel al otro para que sea un borde (0–255, en algún canal). */
const EDGE = 34;
/** Un grupo de bordes de una fila es texto si tiene al menos 5, a 2–26 px uno del otro, y mide 24 px o más. */
const MIN_PEAKS = 5;
const MIN_GAP = 2;
const MAX_GAP = 26;
const MIN_SPAN = 24;
/** Y si se repite en al menos 4 filas seguidas (un renglón tiene alto). */
const MIN_ROWS = 4;

type Seg = { x1: number; x2: number; y: number };
type Box = { x1: number; x2: number; y1: number; y2: number; rows: Set<number> };

export function scanText(src: CanvasImageSource, sw: number, sh: number): TextBox[] {
  if (!sw || !sh) return [];
  const H = Math.max(1, Math.round((W * sh) / sw));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(src, 0, 0, W, H);
  let d: Uint8ClampedArray;
  try {
    d = ctx.getImageData(0, 0, W, H).data;
  } catch {
    return [];
  }

  // El borde entre a y b: lo que más cambia en alguno de los tres canales.
  const diff = (a: number, b: number) => Math.max(Math.abs(d[a] - d[b]), Math.abs(d[a + 1] - d[b + 1]), Math.abs(d[a + 2] - d[b + 2]));

  const segs: Seg[] = [];
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    const peaks: number[] = [];
    for (let x = 2; x < W - 2; x++) {
      const dx = diff(row + (x + 1) * 4, row + (x - 1) * 4);
      if (dx <= EDGE) continue;
      // Solo los picos (el punto más fuerte de cada borde), para no contar dos veces el mismo trazo.
      const left = diff(row + (x - 1) * 4, row + (x - 2) * 4);
      const right = diff(row + (x + 2) * 4, row + (x + 1) * 4);
      if (dx >= left && dx >= right) {
        peaks.push(x);
        x++;
      }
    }
    if (peaks.length < MIN_PEAKS) continue;
    let run = [peaks[0]];
    const close = () => {
      if (run.length >= MIN_PEAKS && run[run.length - 1] - run[0] >= MIN_SPAN) segs.push({ x1: run[0], x2: run[run.length - 1], y });
    };
    for (let i = 1; i < peaks.length; i++) {
      const gap = peaks[i] - peaks[i - 1];
      if (gap >= MIN_GAP && gap <= MAX_GAP) run.push(peaks[i]);
      else {
        close();
        run = [peaks[i]];
      }
    }
    close();
  }

  // Filas seguidas que se pisan a lo ancho forman un renglón.
  const boxes: Box[] = [];
  for (const s of segs) {
    const box = boxes.find((b) => s.y <= b.y2 + 2 && s.x2 >= b.x1 - 10 && s.x1 <= b.x2 + 10);
    if (box) {
      box.x1 = Math.min(box.x1, s.x1);
      box.x2 = Math.max(box.x2, s.x2);
      box.y2 = Math.max(box.y2, s.y);
      box.rows.add(s.y);
    } else boxes.push({ x1: s.x1, x2: s.x2, y1: s.y, y2: s.y, rows: new Set([s.y]) });
  }

  return boxes
    .filter((b) => {
      const w = b.x2 - b.x1;
      const h = b.y2 - b.y1 + 1;
      if (b.rows.size < MIN_ROWS) return false;
      // Un renglón es parejo: casi todas sus filas tienen letras.
      if (b.rows.size / h < 0.5) return false;
      // Una mancha alta y casi cuadrada es textura, no un renglón (los renglones son más anchos que altos).
      if (h > H * 0.06 && w < h * 1.6) return false;
      // Media pantalla "con letras" es una foto con mucho detalle.
      if (w * h > W * H * 0.25) return false;
      return true;
    })
    .map((b) => ({ x: b.x1 / W, y: b.y1 / H, w: (b.x2 - b.x1) / W, h: (b.y2 - b.y1 + 1) / H }));
}

/** Junta las cajas que se pisan (de varios cuadros de un video): un texto que no se mueve queda una vez. */
function mergeBoxes(list: TextBox[]): TextBox[] {
  const out: TextBox[] = [];
  for (const b of list) {
    const same = out.find((o) => {
      const ix = Math.min(o.x + o.w, b.x + b.w) - Math.max(o.x, b.x);
      const iy = Math.min(o.y + o.h, b.y + b.h) - Math.max(o.y, b.y);
      return ix > 0 && iy > 0 && ix * iy >= 0.5 * Math.min(o.w * o.h, b.w * b.h);
    });
    if (!same) {
      out.push({ ...b });
      continue;
    }
    const x2 = Math.max(same.x + same.w, b.x + b.w);
    const y2 = Math.max(same.y + same.h, b.y + b.h);
    same.x = Math.min(same.x, b.x);
    same.y = Math.min(same.y, b.y);
    same.w = x2 - same.x;
    same.h = y2 - same.y;
  }
  return out;
}

/** Cuántos cuadros se miran de un video: uno cada ~2 s, entre 3 y 8. */
function videoTimes(duration: number) {
  if (!isFinite(duration) || duration <= 0) return [0];
  const n = Math.max(3, Math.min(8, Math.round(duration / 2)));
  return Array.from({ length: n }, (_, i) => (duration * (i + 0.5)) / n);
}

/** Los textos de un creativo; de un video, los de varios cuadros (el texto puede aparecer en cualquier momento). */
export function scanMedia(media: AdMedia): Promise<TextBox[]> {
  return new Promise((resolve) => {
    if (media.kind === "image") {
      const img = new Image();
      img.onload = () => resolve(scanText(img, img.naturalWidth, img.naturalHeight));
      img.onerror = () => resolve([]);
      img.src = media.url;
      return;
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let times: number[] = [];
    let probing = false;
    const found: TextBox[] = [];
    const next = () => {
      const t = times.shift();
      if (t === undefined) return resolve(mergeBoxes(found));
      video.currentTime = t;
    };
    const start = () => {
      times = videoTimes(video.duration);
      next();
    };
    video.onloadedmetadata = () => {
      if (isFinite(video.duration)) return start();
      // Algunos .webm no dicen cuánto duran hasta llegar al final: se salta al final para saberlo.
      probing = true;
      video.currentTime = 1e101;
    };
    video.onseeked = () => {
      if (probing) {
        probing = false;
        return start();
      }
      found.push(...scanText(video, video.videoWidth, video.videoHeight));
      next();
    };
    video.onerror = () => resolve(mergeBoxes(found));
    video.src = media.url;
  });
}
