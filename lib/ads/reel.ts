/**
 * Un anuncio en Reels de Instagram, en un iPhone de 390 × 844 pt. Las medidas salen de una captura real
 * (923 × 2000 px, 2,367 px por pt): el creativo va en 9:16 a lo ancho, entre una franja arriba (debajo
 * del notch) y la franja del texto; abajo queda la barra de comentarios.
 */
export const SCREEN = { w: 390, h: 844 };
export const MEDIA_TOP = 34.6;
export const MEDIA_H = (SCREEN.w * 16) / 9;
export const MEDIA_BOTTOM = MEDIA_TOP + MEDIA_H;
/** Donde termina la franja del texto del posteo y empieza la de comentarios. */
export const CAPTION_BOTTOM = 762;

/** Lo que Meta pide dejar libre en un 9:16 (Guía de anuncios): 14 % arriba, 35 % abajo y 6 % a cada costado. */
export const META_SAFE = { top: 0.14, bottom: 0.35, side: 0.06 };

/** Los botones de llamada a la acción, como los muestra Instagram en español. */
export const CTAS = [
  "Más información",
  "Comprar",
  "Comprar ahora",
  "Registrarte",
  "Reservar",
  "Contactarnos",
  "Enviar mensaje",
  "Enviar mensaje de WhatsApp",
  "Obtener oferta",
  "Solicitar ahora",
  "Pedir ahora",
  "Descargar",
  "Ver más",
  "Suscribirte",
  "Obtener cotización",
];

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
