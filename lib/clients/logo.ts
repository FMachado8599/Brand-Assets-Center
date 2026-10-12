import { rgbToHex } from "./color";

export const LOGO_TYPES = ["image/svg+xml", "image/png", "image/jpeg", "image/webp", "image/gif"];
export const LOGO_ACCEPT = ".svg,.png,.jpg,.jpeg,.webp,.gif";
const MAX_BYTES = 5 * 1024 * 1024;

/** null si el archivo sirve como logo; si no, por qué. */
export function logoProblem(file: File): string | null {
  if (!LOGO_TYPES.includes(file.type)) return "El logo tiene que ser SVG, PNG, JPG, WEBP o GIF";
  if (file.size > MAX_BYTES) return "El logo pesa más de 5 MB";
  return null;
}

function loadImage(src: string, crossOrigin: boolean) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la imagen"));
    img.src = src;
  });
}

/**
 * Los colores principales de un logo, del más usado al menos usado. Ignora
 * lo transparente y el blanco casi puro (suele ser el fondo). Sirve para
 * sugerir la paleta del cliente sin tener que buscar los hex a mano.
 *
 * `src` puede ser un archivo recién elegido o la URL pública del logo (el
 * bucket responde con CORS abierto).
 */
export async function logoColors(src: File | string, max = 5): Promise<string[]> {
  const local = typeof src !== "string";
  const url = local ? URL.createObjectURL(src) : src;
  try {
    const img = await loadImage(url, !local);
    const size = 96;
    // Un SVG sin tamaño propio viene en 0: se dibuja al tamaño del lienzo.
    const w = img.naturalWidth || size;
    const h = img.naturalHeight || size;
    const scale = Math.min(1, size / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Cubetas de 4 bits por canal: tonos casi iguales (antialias) cuentan como uno.
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 200) continue;
      if (r > 242 && g > 242 && b > 242) continue;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bucket.n++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
      total++;
    }
    if (!total) return [];

    const out: [number, number, number][] = [];
    const sorted = Array.from(buckets.values()).sort((a, b) => b.n - a.n);
    for (const c of sorted) {
      // Lo que aparece en menos del 1,5% es borde o detalle, no un color de la marca.
      if (c.n / total < 0.015) break;
      const rgb: [number, number, number] = [c.r / c.n, c.g / c.n, c.b / c.n];
      const near = out.some((o) => Math.abs(o[0] - rgb[0]) + Math.abs(o[1] - rgb[1]) + Math.abs(o[2] - rgb[2]) < 60);
      if (!near) out.push(rgb);
      if (out.length >= max) break;
    }
    return out.map(([r, g, b]) => rgbToHex(r, g, b));
  } catch {
    return [];
  } finally {
    if (local) URL.revokeObjectURL(url);
  }
}
