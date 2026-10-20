/** La pantalla de los mockups: un iPhone de 390 × 844 pt (las capturas de referencia son de ese tamaño). */
export const SCREEN = { w: 390, h: 844 };

/** Lo que Meta pide dejar libre en un 9:16 (Guía de anuncios): 14 % arriba, 35 % abajo y 6 % a cada costado. */
export const META_SAFE = { top: 0.14, bottom: 0.35, side: 0.06 };

export type AdMedia = { url: string; kind: "image" | "video"; width: number; height: number; name: string };

/** Cuánto se aleja del 9:16 (0 = justo). */
export function ratioGap(m: Pick<AdMedia, "width" | "height">) {
  return Math.abs(m.width / m.height - 9 / 16) / (9 / 16);
}

/** "9:16", "4:5", "1:1"… o los píxeles si no es una proporción conocida. */
export function ratioLabel({ width, height }: Pick<AdMedia, "width" | "height">) {
  const known: [string, number][] = [["9:16", 9 / 16], ["4:5", 4 / 5], ["1:1", 1], ["16:9", 16 / 9], ["2:3", 2 / 3], ["3:4", 3 / 4]];
  const r = width / height;
  const hit = known.find(([, v]) => Math.abs(r - v) / v < 0.02);
  return hit ? hit[0] : `${width}×${height}`;
}
