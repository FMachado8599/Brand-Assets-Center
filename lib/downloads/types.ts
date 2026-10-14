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

/** Una calidad que ofrece un video de YouTube: `q` es el tope que se le pide al servicio, `res` lo que sale. */
export type YoutubeQuality = {
  q: number;
  res: number;
  /** Peso estimado con audio y sin audio, en bytes. */
  video?: number;
  mute?: number;
};

/**
 * YouTube no se baja desde Vercel: lo baja el servicio de la PC (worker/youtube) en la calidad que se elija.
 * El navegador le habla directo, con un permiso firmado por la app que sirve solo para este video.
 */
export type YoutubeSource = {
  worker: string;
  token: string;
  qualities: YoutubeQuality[];
  /** Peso estimado del audio solo, en bytes. */
  audio?: number;
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
  /** Vacío en YouTube: el archivo se arma en el servicio cuando se pide (ver `youtube`). */
  files: MediaFile[];
  youtube?: YoutubeSource;
};

/** Qué hacer con el sonido de los videos. */
export type AudioMode = "con" | "sin" | "solo";

/** Dónde se guarda lo que se baja. */
export type Destination = "compu" | "ambos" | "drive";

export type DriveFolder = { id: string; name: string; url: string };

export type SaveSettings = {
  destino: Destination;
  audio: AudioMode;
  carpeta: DriveFolder | null;
};
