import type { CancionSpotify } from "./types";

type Imagen = { url: string; width: number | null };

/** Una canción tal como la devuelve la Web API (lo que usamos). */
export type TrackApi = {
  type?: string;
  uri: string;
  name: string;
  duration_ms: number;
  is_playable?: boolean;
  artists: { name: string }[];
  album: { name: string; images: Imagen[] };
};

export function aCancion(t: TrackApi): CancionSpotify {
  // Las imágenes vienen de mayor a menor: para una lista alcanza la más chica de al menos 64px.
  const imagenes = [...t.album.images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return {
    uri: t.uri,
    nombre: t.name,
    artistas: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    portada: (imagenes.find((i) => (i.width ?? 0) >= 64) ?? imagenes[0])?.url ?? null,
    duracion: t.duration_ms,
    disponible: t.is_playable !== false,
  };
}

/** Las de la cola pueden ser episodios de podcast (sin álbum): esos se saltean. */
export const esTrack = (t: unknown): t is TrackApi =>
  Boolean(t && typeof t === "object" && "album" in t && "artists" in t);
