/**
 * Tipos y utilidades de emojis que sí viajan al navegador. El catálogo
 * completo vive solo en el servidor (catalog.server.ts): el cliente recibe
 * los emojis de a páginas desde /api/emojis.
 *
 * Claves cortas para que las respuestas pesen poco:
 *   i  id del archivo en Storage (codepoints en minúscula, ej "1f44d")
 *   c  el carácter        n / e  nombre en español / inglés
 *   t / u  etiquetas en español / inglés
 *   g / s  grupo y subgrupo   k  ids de las variantes por tono (1 a 5)
 */
export type EmojiEntry = {
  i: string;
  c: string;
  n: string;
  e: string;
  t: string[];
  u: string[];
  g: number;
  s: number;
  k?: (string | null)[];
};

export type EmojiSubgroup = { id: number; key: string; name: string };
export type EmojiGroup = { id: number; key: string; name: string; subgroups: EmojiSubgroup[] };

/** Lo que el inicio necesita de cada categoría: nombre, cantidad y el primer emoji como portada. */
export type CategorySummary = {
  id: number;
  key: string;
  name: string;
  count: number;
  cover: { i: string; n: string };
  subgroups: (EmojiSubgroup & { count: number })[];
};

export type EmojiPage = {
  emojis: EmojiEntry[];
  nextCursor: number | null;
  total: number;
  /** Solo en búsquedas: si se usó la búsqueda por significado además de la de palabras. */
  mode?: "hybrid" | "keywords";
};

/** Cuántos emojis trae cada pedido ("Cargar más" pide la siguiente página). */
export const PAGE_SIZE = 60;

export type Tone = 0 | 1 | 2 | 3 | 4 | 5;

export const TONES: { tone: Tone; label: string; color: string }[] = [
  { tone: 0, label: "Sin tono", color: "#FFCB2E" },
  { tone: 1, label: "Claro", color: "#F7DECE" },
  { tone: 2, label: "Claro medio", color: "#E6C1A2" },
  { tone: 3, label: "Medio", color: "#C49A72" },
  { tone: 4, label: "Medio oscuro", color: "#9B6A45" },
  { tone: 5, label: "Oscuro", color: "#5E4335" },
];

/** El archivo a usar para un emoji con el tono elegido (si el emoji no tiene tonos, el de siempre). */
export function variantId(emoji: Pick<EmojiEntry, "i" | "k">, tone: Tone) {
  return (tone && emoji.k?.[tone - 1]) || emoji.i;
}

export function imageUrl(id: string, full = false) {
  return `/api/emojis/img/${id}${full ? "?v=full" : ""}`;
}

/** Nombre de archivo legible: "pulgar-hacia-arriba" (+ "-tono-3"). */
export function fileName(emoji: EmojiEntry, tone: Tone) {
  const base = emoji.n
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return tone && emoji.k?.[tone - 1] ? `${base}-tono-${tone}` : base || emoji.i;
}

/** El carácter de la variante elegida: se arma desde el id, que ya trae los codepoints. */
export function charFor(emoji: Pick<EmojiEntry, "i" | "c" | "k">, tone: Tone) {
  const id = variantId(emoji, tone);
  if (id === emoji.i) return emoji.c;
  return id
    .split("-")
    .map((hex) => String.fromCodePoint(parseInt(hex, 16)))
    .join("");
}
