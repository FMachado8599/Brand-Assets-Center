/** Una canción de la búsqueda, con lo justo para mostrarla y mandarla a reproducir. */
export type CancionSpotify = {
  uri: string;
  nombre: string;
  artistas: string;
  album: string;
  portada: string | null;
  /** ms */
  duracion: number;
  /** false si Spotify dice que esta cuenta no la puede escuchar (ej: no está en su país). */
  disponible: boolean;
};

/** La cuenta de Spotify conectada (sin tokens: eso no sale del servidor). */
export type CuentaSpotify = { id: string; nombre: string };

/** Lo que suena en la cuenta (en cualquier dispositivo, ej: el celular que tiene el Jam) y lo que viene. */
export type ColaSpotify = {
  /** null: Spotify no está sonando en ningún lado. */
  dispositivo: { nombre: string; tipo: string } | null;
  sonando: boolean;
  actual: CancionSpotify | null;
  siguientes: CancionSpotify[];
};
