import { frameOf, placementInfo, type Placement } from "./placements";
import { META_SAFE, SCREEN, type AdMedia } from "./reel";

/**
 * Qué parte de un mockup 9:16 no es segura para poner texto: las bandas de la guía de Meta (14 % arriba,
 * 35 % abajo y 6 % a los costados) y, en Reels, la columna de íconos del costado, medida con todos sus números.
 * Todo en puntos de la pantalla (390 × 844).
 */

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Los íconos del costado en Reels (me gusta, comentarios, compartidos y enviados, cada uno con su número
 * abajo, y el ⋯), de arriba abajo. Van pegados abajo: con los números la columna crece para arriba, como en
 * Instagram. Se dibujan siempre con número para ver el lugar más grande que pueden ocupar.
 *
 * - `items`: el centro de cada ícono; `countDy`: cuánto más abajo va su número.
 * - `left`: hasta dónde llega a la izquierda el número más ancho («12,4 mil»), con un poco de aire.
 */
export const RAIL = {
  // Captura de Changan: sin números iban cada 47 pt; con número, cada 66 (como en la pestaña Reels).
  "reels-feed": { x: 359, sizes: [30, 30, 30, 30], items: [433, 499, 565, 631], more: 693, moreSize: 30, countDy: 27, font: 12, left: 326 },
  // Captura de Jetour: me gusta y enviar traían número (cada 63,1 pt); ahora todos.
  reels: { x: 362, sizes: [28.5, 26, 28.5, 27], items: [497.8, 560.9, 624, 687.1], more: 745.8, moreSize: 12, countDy: 25.6, font: 9.5, left: 334 },
} as const;

type RailPlacement = keyof typeof RAIL;
const hasRail = (p: Placement): p is RailPlacement => p in RAIL;

/** La caja de la columna de íconos (con sus números), o null si el mockup no tiene. */
export function railBox(p: Placement): Rect | null {
  if (!hasRail(p)) return null;
  const r = RAIL[p];
  const top = r.items[0] - r.sizes[0] / 2 - 6;
  const bottom = r.more + r.moreSize / 2 + 6;
  return { x: r.left, y: top, w: SCREEN.w - r.left, h: bottom - top };
}

export type Zones = {
  /** Lo que no es seguro: bandas de Meta y, si hay, la columna de íconos (hasta la banda de abajo). */
  unsafe: Rect[];
  /** El contorno de lo seguro, para dibujarlo (con el escalón de la columna de íconos). */
  outline: [number, number][];
};

/** null en el feed: ahí no va nada encima del creativo (salvo el «1/5» de los carruseles). */
export function zonesOf(p: Placement, media: AdMedia | null): Zones | null {
  if (placementInfo(p).kind === "feed") return null;
  const f = frameOf(p, media);
  const top = f.top + f.height * META_SAFE.top;
  const bottom = f.top + f.height * (1 - META_SAFE.bottom);
  const side = SCREEN.w * META_SAFE.side;
  const right = SCREEN.w - side;
  const unsafe: Rect[] = [
    { x: 0, y: f.top, w: SCREEN.w, h: top - f.top },
    { x: 0, y: bottom, w: SCREEN.w, h: f.top + f.height - bottom },
    { x: 0, y: top, w: side, h: bottom - top },
    { x: right, y: top, w: side, h: bottom - top },
  ];
  const rail = railBox(p);
  let outline: [number, number][] = [
    [side, top],
    [right, top],
    [right, bottom],
    [side, bottom],
  ];
  if (rail && rail.y < bottom) {
    const y = Math.max(top, rail.y);
    unsafe.push({ x: rail.x, y, w: SCREEN.w - rail.x, h: bottom - y });
    outline = [
      [side, top],
      [right, top],
      [right, y],
      [rail.x, y],
      [rail.x, bottom],
      [side, bottom],
    ];
  }
  return { unsafe, outline };
}

/** Un texto encontrado en el creativo, en fracciones de su ancho y alto (0 a 1). */
export type TextBox = Rect;

/** Dónde queda el creativo en la pantalla (como lo dibuja el mockup: cubriendo o entero). */
function mediaRect(p: Placement, media: AdMedia, fit: "cover" | "contain"): Rect {
  const f = frameOf(p, media);
  const k = fit === "cover" ? Math.max(SCREEN.w / media.width, f.height / media.height) : Math.min(SCREEN.w / media.width, f.height / media.height);
  const w = media.width * k;
  const h = media.height * k;
  return { x: (SCREEN.w - w) / 2, y: f.top + (f.height - h) / 2, w, h };
}

const area = (r: Rect) => Math.max(0, r.w) * Math.max(0, r.h);

function overlap(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y };
}

/**
 * Los textos del creativo que caen en lo que no es seguro (o que quedan cortados afuera de la pantalla),
 * ya en puntos de la pantalla. Cuenta si al menos el 15 % del texto está en una zona no segura: un borde
 * que apenas roza no es un problema, pero un texto pegado al costado de la pantalla sí.
 */
export function textCollisions(p: Placement, media: AdMedia | null, fit: "cover" | "contain", texts: TextBox[]): Rect[] {
  const zones = zonesOf(p, media);
  if (!zones || !media || !texts.length) return [];
  const f = frameOf(p, media);
  const m = mediaRect(p, media, fit);
  const frame: Rect = { x: 0, y: f.top, w: SCREEN.w, h: f.height };
  const hits: Rect[] = [];
  for (const t of texts) {
    const box = { x: m.x + t.x * m.w, y: m.y + t.y * m.h, w: t.w * m.w, h: t.h * m.h };
    const total = area(box);
    if (!total) continue;
    const visible = overlap(box, frame);
    // Lo que queda afuera (recortado) también es un problema; lo que se ve se mide contra cada zona.
    let bad = total - area(visible);
    for (const z of zones.unsafe) bad += area(overlap(visible, z));
    if (bad / total >= 0.15) hits.push(visible.w > 0 && visible.h > 0 ? visible : box);
  }
  return hits;
}
