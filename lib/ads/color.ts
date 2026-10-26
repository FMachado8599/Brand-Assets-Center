/**
 * Los colores que Instagram saca del creativo. El botón de la acción toma el tono del creativo, apagado y a
 * media luz: el promedio pesado por saturación da casi el de la captura de referencia (219° contra 210°, con
 * la misma saturación). Las franjas de arriba y del texto no se pueden deducir (en la referencia son marrones
 * sobre un creativo azul): van muy oscuras con el tono promedio, y no tapan nada del creativo.
 */
export type AdColors = { cta: string; band: string; captionBand: string };

export const DEFAULT_COLORS: AdColors = { cta: "#6b86a1", band: "#2f271c", captionBand: "#241f19" };

function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** En hexadecimal, para que también lo pueda mostrar el selector de color del navegador. */
function hsl(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Lee una versión chiquita de la imagen (o del cuadro del video) y arma los colores. */
export function sampleColors(source: CanvasImageSource, width: number, height: number): AdColors {
  const w = 48;
  const h = Math.max(1, Math.round((w * height) / width));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return DEFAULT_COLORS;
  ctx.drawImage(source, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return DEFAULT_COLORS;
  }

  // Cada píxel pesa lo saturado que es (los grises, los casi negros y los casi blancos casi no cuentan).
  const colorful = { w: 0, r: 0, g: 0, b: 0 };
  const all = { n: 0, r: 0, g: 0, b: 0 };
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    all.n++;
    all.r += r;
    all.g += g;
    all.b += b;
    const [, s, l] = toHsl(r, g, b);
    const weight = l > 0.06 && l < 0.94 ? s : 0;
    colorful.w += weight;
    colorful.r += r * weight;
    colorful.g += g * weight;
    colorful.b += b * weight;
  }
  const [ah, as] = toHsl(all.r / all.n, all.g / all.n, all.b / all.n);
  // En blanco y negro el botón queda gris.
  let cta = hsl(0, 0, 0.5);
  if (colorful.w > 0.5) {
    const [ch, cs] = toHsl(colorful.r / colorful.w, colorful.g / colorful.w, colorful.b / colorful.w);
    cta = hsl(ch, Math.min(Math.max(cs, 0.12), 0.32), 0.52);
  }
  return {
    cta,
    band: hsl(ah, Math.min(as, 0.2), 0.14),
    captionBand: hsl(ah, Math.min(as, 0.2), 0.11),
  };
}
