import { hexToRgb, normalizeHex } from "@/lib/clients/color";
import { LOGO_FORMATS, sortFiles } from "@/lib/clients/logos";
import type { Brand, LogoFile } from "@/lib/types";

/** El color principal de una marca: el primero de su paleta o, si no tiene, el de la lista. */
export const colorPrincipal = (b: Pick<Brand, "color" | "palette">) => (b.palette?.[0]?.hex ?? b.color).toUpperCase();

/** Sus colores, sin repetir: la paleta y el de la lista. */
export function coloresDe(b: Pick<Brand, "color" | "palette">): { hex: string; name: string }[] {
  const out = new Map<string, string>();
  for (const c of b.palette ?? []) {
    const hex = normalizeHex(c.hex);
    if (hex && !out.has(hex)) out.set(hex, c.name);
  }
  const propio = normalizeHex(b.color);
  if (propio && !out.has(propio)) out.set(propio, out.size ? "" : "Principal");
  return [...out].map(([hex, name]) => ({ hex, name }));
}

const distancia = (a: string, b: string) => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  // Pesos de la percepción (más sensible al verde): una cuenta simple y suficiente para "se parece".
  return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2);
};

export type ColorEncontrado = { brand: Brand; hex: string; nombre: string; exacto: boolean; distancia: number };

/** Un HEX pegado ("#e30613", "E30613") → de qué marcas es, o a cuáles se parece. */
export function buscarHex(texto: string, brands: Brand[]): { hex: string; resultados: ColorEncontrado[] } | null {
  const m = texto.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  const crudo = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const hex = normalizeHex(`#${crudo}`);
  if (!hex) return null;
  const todos: ColorEncontrado[] = [];
  for (const brand of brands) {
    const colores = coloresDe(brand);
    let mejor: ColorEncontrado | null = null;
    for (let i = 0; i < colores.length; i++) {
      const c = colores[i];
      const d = distancia(hex, c.hex);
      if (!mejor || d < mejor.distancia) {
        mejor = { brand, hex: c.hex, nombre: c.name || (i === 0 ? "Principal" : `Color ${i + 1}`), exacto: d === 0, distancia: d };
      }
    }
    if (mejor) todos.push(mejor);
  }
  const exactos = todos.filter((x) => x.exacto);
  const resultados = exactos.length ? exactos : todos.filter((x) => x.distancia < 70).sort((a, b) => a.distancia - b.distancia).slice(0, 3);
  return { hex, resultados };
}

/** El archivo de logo que se baja con un click: del primer logo, el SVG o, si no hay, el que mejor se vea. */
export function logoParaBajar(b: Brand): { file: LogoFile | null; url: string | null; nombre: string } {
  const primero = b.logos?.[0];
  if (primero?.files.length) {
    const file = sortFiles(primero.files).find((f) => f.format === "svg" || f.format === "png") ?? sortFiles(primero.files)[0];
    const ext = LOGO_FORMATS[file.format].exts[0];
    return { file, url: file.url, nombre: `${b.name} ${primero.name}.${ext}`.replace(/[\\/:*?"<>|]+/g, "-") };
  }
  if (b.logo_url) {
    const ext = (b.logo_path ?? b.logo_url).split("?")[0].split(".").pop() || "png";
    return { file: null, url: b.logo_url, nombre: `${b.name} logo.${ext}`.replace(/[\\/:*?"<>|]+/g, "-") };
  }
  return { file: null, url: null, nombre: "" };
}
