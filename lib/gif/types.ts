export type DurationSource = "filename" | "default" | "manual";

export type Size = { width: number; height: number };

export type Frame = {
  id: string;
  file: File;
  filename: string;
  /** URL local para las miniaturas (object URL). */
  url: string;
  /**
   * Grupo al que pertenece. Los que se llaman igual y terminan en número comparten clave
   * (ej "banner|@300x250"); un grupo de un solo frame es una imagen suelta.
   */
  groupKey: string;
  /** Nombre del GIF del grupo (todos los frames del grupo lo comparten). */
  groupName: string;
  /** El nombre que retoma si se saca del GIF y queda suelta. */
  ownName: string;
  /** Medida que dice el nombre del archivo (300x250_1.jpg), si la dice. */
  namedSize?: Size;
  /** Medida real del archivo. */
  natural: Size;
  /** El número del final del nombre; manda en el orden hasta que se ordena a mano. */
  order: number;
  /** null = usa la duración por defecto de los ajustes. */
  durationMs: number | null;
  durationSource: DurationSource;
};

export type InvalidFile = { id: string; filename: string; url?: string; reason: string };

export type GifGroup = {
  key: string;
  name: string;
  width: number;
  height: number;
  frames: Frame[];
  warnings: string[];
};

export type GifQuality = "alta" | "equilibrada" | "liviana" | "minima";

export type GifSettings = {
  defaultDuration: number;
  unit: "s" | "ms";
  loop: boolean;
  quality: GifQuality;
  /** Peso máximo aceptado en KB (0 = sin límite). Las redes de display suelen pedir 150. */
  maxKb: number;
  /** Si un GIF se pasa del peso máximo, bajar los colores hasta que entre. */
  fit: boolean;
};

export const DEFAULT_GIF_SETTINGS: GifSettings = {
  defaultDuration: 1,
  unit: "s",
  loop: true,
  quality: "equilibrada",
  maxKb: 150,
  fit: true,
};

export const QUALITY_COLORS: Record<GifQuality, number> = {
  alta: 256,
  equilibrada: 192,
  liviana: 128,
  minima: 64,
};

export const QUALITY_LABELS: Record<GifQuality, string> = {
  alta: "Alta",
  equilibrada: "Equilibrada",
  liviana: "Liviana",
  minima: "Mínima",
};
