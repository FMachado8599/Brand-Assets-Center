import type { CancionSpotify, EstadoJam } from "./types";

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

const clave = (c: Pick<CancionSpotify, "nombre" | "artistas">) =>
  `${c.nombre}|${c.artistas}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * ¿Ya está sonando o en la cola? Por URI o por nombre + artistas (la misma canción puede estar en
 * un single y en un álbum, con URIs distintas). Lo usan el servidor (para no sumarla) y la burbuja.
 */
export function yaEsta(c: Pick<CancionSpotify, "uri" | "nombre" | "artistas">, jam: Pick<EstadoJam, "actual" | "siguientes"> | null) {
  if (!jam) return false;
  return [jam.actual, ...jam.siguientes].some((x) => x && (x.uri === c.uri || clave(x) === clave(c)));
}
