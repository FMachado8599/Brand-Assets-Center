/** Lo que la página sabe de un ícono de Magnific: lo justo para mostrarlo y pedir su archivo. */

export type Icon = {
  id: number;
  name: string;
  /** La miniatura en PNG (pública, del CDN de Magnific): se muestra sin gastar descargas. */
  thumb: string;
  style: string | null;
  family: string | null;
  author: string | null;
};

export type IconPage = { items: Icon[]; total: number; next: number | null };

export type IconFormat = "svg" | "png";

/** Los tamaños de PNG que da Magnific. */
export const PNG_SIZES = [64, 128, 256, 512] as const;
export type PngSize = (typeof PNG_SIZES)[number];

/** Los estilos de la barra, con el valor que entiende Magnific (filters[shape]). */
export const SHAPES = [
  { value: "", label: "Todos" },
  { value: "outline", label: "Contorno" },
  { value: "fill", label: "Relleno" },
  { value: "lineal-color", label: "Contorno a color" },
  { value: "hand-drawn", label: "A mano" },
] as const;
export type Shape = (typeof SHAPES)[number]["value"];

export const isShape = (v: string): v is Shape => SHAPES.some((s) => s.value === v);
