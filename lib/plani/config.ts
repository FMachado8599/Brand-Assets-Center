import type { Aprobacion, Formato, Pieza, PlaniEstado, Plataforma, Proporcion, Rol, StickerTipo } from "./types";

export const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Setiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** El calendario arranca el lunes, como en la plani de siempre. */
export const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Las etapas de una plani, en orden. El color es el del punto en la lista. */
export const ESTADOS: { value: PlaniEstado; label: string; hint: string; color: string }[] = [
  { value: "redaccion", label: "Redacción", hint: "Se piensan las ideas y los copys", color: "#6D28D9" },
  { value: "diseno", label: "Diseño", hint: "Se diseña el material", color: "#1D4ED8" },
  { value: "revision", label: "Revisión", hint: "Validación interna", color: "#B45309" },
  { value: "cliente", label: "En cliente", hint: "Esperando la aprobación del cliente", color: "#B61760" },
  { value: "programacion", label: "Programación", hint: "El CM la está programando", color: "#047857" },
  { value: "lista", label: "Lista", hint: "Todo programado", color: "#0b0b0e" },
];

export const estadoInfo = (estado: PlaniEstado) => ESTADOS.find((e) => e.value === estado) ?? ESTADOS[0];

/**
 * El botón para dar por terminada la etapa: qué dice y a cuál pasa. Pasar no cierra nada: si hay
 * ajustes, se vuelve a la etapa anterior desde el mismo paso a paso.
 */
export const CIERRE: Partial<Record<PlaniEstado, { label: string; siguiente: PlaniEstado }>> = {
  redaccion: { label: "Redacción lista", siguiente: "diseno" },
  diseno: { label: "Diseño listo", siguiente: "revision" },
  revision: { label: "Revisión lista", siguiente: "cliente" },
  cliente: { label: "Aprobada por el cliente", siguiente: "programacion" },
  programacion: { label: "Todo programado", siguiente: "lista" },
};

/** Qué vista conviene en cada etapa, para quien no es de ningún sector en particular. */
export const ROL_DE_ESTADO: Record<PlaniEstado, Rol> = {
  redaccion: "redaccion",
  diseno: "diseno",
  revision: "diseno",
  cliente: "cm",
  programacion: "cm",
  lista: "cm",
};

/** La vista de cada sector del equipo (sectores de migracion-equipo.sql). */
export const ROL_DE_SECTOR: Record<string, Rol> = { redaccion: "redaccion", diseno_digital: "diseno", cm: "cm" };

/** Formatos, con sus medidas para diseño (en px, como se exportan). */
export const FORMATOS: Record<
  Formato,
  { label: string; plural: string; proporciones: Proporcion[]; color: string; video: boolean; multiple: boolean }
> = {
  post: { label: "Post", plural: "Posts", proporciones: ["4:5", "1:1"], color: "#FFD100", video: false, multiple: false },
  carrusel: { label: "Carrusel", plural: "Carruseles", proporciones: ["4:5", "1:1"], color: "#FFB000", video: false, multiple: true },
  reel: { label: "Reel", plural: "Reels", proporciones: ["9:16"], color: "#E5484D", video: true, multiple: false },
  historia: { label: "Historia", plural: "Historias", proporciones: ["9:16"], color: "#FF7A00", video: true, multiple: false },
  banner: { label: "Banner", plural: "Banners", proporciones: ["libre"], color: "#0EA5E9", video: false, multiple: false },
};

/** Los formatos de redes (los de siempre). El banner se suma en los tipos con GIF. */
export const FORMATO_ORDEN: Formato[] = ["post", "carrusel", "reel", "historia"];
export const formatosDe = (conGif: boolean): Formato[] => (conGif ? [...FORMATO_ORDEN, "banner"] : FORMATO_ORDEN);

/** Las medidas de display más pedidas (IAB), para elegir rápido. */
export const BANNERS: { w: number; h: number; label: string }[] = [
  { w: 300, h: 250, label: "Medium rectangle" },
  { w: 728, h: 90, label: "Leaderboard" },
  { w: 160, h: 600, label: "Skyscraper" },
  { w: 300, h: 600, label: "Half page" },
  { w: 320, h: 50, label: "Mobile banner" },
  { w: 320, h: 100, label: "Large mobile" },
  { w: 970, h: 250, label: "Billboard" },
  { w: 336, h: 280, label: "Large rectangle" },
];

export const MEDIDAS: Record<Proporcion, { w: number; h: number; label: string }> = {
  "4:5": { w: 1080, h: 1350, label: "Feed 4:5" },
  "1:1": { w: 1080, h: 1080, label: "Feed 1:1" },
  "9:16": { w: 1080, h: 1920, label: "Vertical 9:16" },
  "16:9": { w: 1920, h: 1080, label: "Horizontal 16:9" },
  libre: { w: 300, h: 250, label: "Banner" },
};

/** La medida de una pieza: la de su proporción o, en un banner, la que se le puso. */
export function medidaDe(p: Pick<Pieza, "proporcion" | "ancho" | "alto">) {
  if (p.proporcion === "libre") {
    const w = p.ancho ?? MEDIDAS.libre.w;
    const h = p.alto ?? MEDIDAS.libre.h;
    return { w, h, label: "Banner" };
  }
  return MEDIDAS[p.proporcion];
}

/** Cómo se nombra el formato en la presentación ("Feed 4:5", "Historia"…), como en la plani de siempre. */
export function nombreFormato(formato: Formato, proporcion: Proporcion) {
  if (formato === "banner") return "Banner";
  if (formato === "post") return `Feed ${proporcion}`;
  if (formato === "carrusel") return `Carrusel ${proporcion}`;
  return FORMATOS[formato].label;
}

export const PLATAFORMAS: { value: Plataforma; label: string; limite: number }[] = [
  { value: "instagram", label: "Instagram", limite: 2200 },
  { value: "facebook", label: "Facebook", limite: 63206 },
  { value: "tiktok", label: "TikTok", limite: 2200 },
  { value: "linkedin", label: "LinkedIn", limite: 3000 },
  { value: "youtube", label: "YouTube", limite: 5000 },
  { value: "x", label: "X", limite: 280 },
];

export const plataformaInfo = (p: Plataforma) => PLATAFORMAS.find((x) => x.value === p) ?? PLATAFORMAS[0];

export const APROBACION: Record<Aprobacion, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-secondary text-muted-foreground" },
  aprobada: { label: "Aprobada", className: "bg-emerald-600/15 text-emerald-800" },
  cambios: { label: "Con cambios", className: "bg-destructive/12 text-destructive" },
};

export const ROLES: { value: Rol; label: string; hint: string }[] = [
  { value: "redaccion", label: "Redacción", hint: "Ideas, copys e indicaciones para diseño" },
  { value: "diseno", label: "Diseño", hint: "Lo que pidió redacción y el material final" },
  { value: "cm", label: "CM", hint: "Copys listos, material para bajar y qué está programado" },
];

export const STICKERS: { value: StickerTipo; label: string }[] = [
  { value: "link", label: "Link" },
  { value: "encuesta", label: "Encuesta" },
  { value: "pregunta", label: "Pregunta" },
  { value: "cuenta", label: "Cuenta regresiva" },
  { value: "mencion", label: "Mención" },
  { value: "ubicacion", label: "Ubicación" },
  { value: "hashtag", label: "Hashtag" },
  { value: "slider", label: "Slider de emoji" },
  { value: "reaccion", label: "Reacción" },
];
