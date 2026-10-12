import type { BrandColor } from "@/lib/types";

/** Los colores para elegir rápido al crear un cliente (los de siempre de Tarjetas). */
export const PRESET_COLORS = ["#B61760", "#1D4ED8", "#047857", "#B45309", "#6D28D9", "#52525B"];

/** "#abc", "abc", "#AABBCC" → "#AABBCC". null si no es un color hex. */
export function normalizeHex(raw: string): string | null {
  const v = raw.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(v)) return `#${v.split("").map((c) => c + c).join("")}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(v)) return `#${v}`.toUpperCase();
  return null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = (normalizeHex(hex) ?? "#000000").slice(1);
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

export const rgbText = (hex: string) => `rgb(${hexToRgb(hex).join(", ")})`;

/** Luminancia relativa (WCAG): 0 es negro, 1 es blanco. */
function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Texto que se lee encima de ese color: tinta o blanco. */
export const inkOn = (hex: string) => (luminance(hex) > 0.4 ? "#0b0b0e" : "#ffffff");

/** Tan claro que sobre el papel de la app no se ve el borde: hay que dibujarle uno. */
export const isVeryLight = (hex: string) => luminance(hex) > 0.82;

/** La paleta que vino de la base, sin nada raro. */
export function cleanPalette(value: unknown): BrandColor[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((c) => ({ hex: normalizeHex(String(c?.hex ?? "")), name: typeof c?.name === "string" ? c.name : "" }))
    .filter((c): c is BrandColor => !!c.hex);
}

/** Iniciales para cuando no hay logo: "Banco Nación" → "BN", "Changan" → "CH". */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
