/** Una canción del catálogo, con lo justo para mostrarla y sumarla a la cola. */
export type CancionSpotify = {
  uri: string;
  nombre: string;
  artistas: string;
  album: string;
  portada: string | null;
  /** ms */
  duracion: number;
  /** false si Spotify dice que la cuenta del DJ no la puede escuchar (ej: no está en su país). */
  disponible: boolean;
};

/** El Jam del estudio tal como lo ve cualquiera de la app (sin tokens). */
export type EstadoJam = {
  /** null: nadie armó el Jam todavía. */
  dj: { usuario: string; nombre: string; spotify: string } | null;
  /** Para unirse desde Spotify; null si el DJ todavía no lo pegó. */
  link: string | null;
  /** null: en la cuenta del DJ no suena nada en ningún dispositivo. */
  dispositivo: { nombre: string; tipo: string } | null;
  sonando: boolean;
  actual: CancionSpotify | null;
  /** ms, al momento de leerlo. */
  progreso: number;
  /** Hace cuánto se le preguntó a Spotify (ms): con eso el progreso sigue avanzando en la pantalla. */
  leidoHace: number;
  siguientes: CancionSpotify[];
  /** Algo anda mal con la conexión del DJ (ej: venció y tiene que volver a conectar). */
  aviso: string | null;
};
