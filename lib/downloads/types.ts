export type Platform = "instagram" | "pinterest" | "youtube";

/** Un archivo para bajar: un posteo puede traer varios (los carruseles de Instagram). */
export type MediaFile = {
  kind: "video" | "image";
  url: string;
  ext: string;
  width?: number;
  height?: number;
  /** En bytes, cuando el origen lo informa. */
  size?: number;
  /** Miniatura propia de este archivo, para elegirlo dentro de un carrusel. */
  thumbnail?: string;
};

export type MediaInfo = {
  platform: Platform;
  id: string;
  pageUrl: string;
  title: string;
  author?: string;
  /** El texto completo del posteo, para copiarlo. */
  caption?: string;
  thumbnail?: string;
  /** En segundos, solo cuando es un video solo. */
  duration?: number;
  files: MediaFile[];
};
