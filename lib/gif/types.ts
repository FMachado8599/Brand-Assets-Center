export type DurationSource = "filename" | "default" | "manual";

export type Frame = {
  id: string;
  file: File;
  filename: string;
  /** URL local para las miniaturas (object URL). */
  url: string;
  /** Grupo al que pertenece: prefijo + medida, ej "verano_300x250". */
  groupKey: string;
  prefix: string;
  width: number;
  height: number;
  order: number;
  /** null = usa la duración por defecto de los ajustes. */
  durationMs: number | null;
  durationSource: DurationSource;
  /** Medida real del archivo, para avisar si no coincide con el nombre. */
  natural?: { width: number; height: number };
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
