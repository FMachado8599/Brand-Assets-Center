import { NextResponse, type NextRequest } from "next/server";
import { SPOTIFY_API, SpotifyError } from "@/lib/spotify/auth";
import { aCancion, esTrack } from "@/lib/spotify/catalogo";
import { tokenSpotify } from "@/lib/spotify/sesion";
import type { ColaSpotify } from "@/lib/spotify/types";

export const dynamic = "force-dynamic";

const URI_TRACK = /^spotify:track:[A-Za-z0-9]{22}$/;

function responder(e: unknown, generico: string) {
  const error = e instanceof SpotifyError ? e : new SpotifyError(generico, 502);
  return NextResponse.json({ error: error.message, reconectar: error.reconectar }, { status: error.status });
}

async function spotify(accessToken: string, path: string, init?: RequestInit) {
  return fetch(`${SPOTIFY_API()}/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
    cache: "no-store",
  });
}

/** Spotify dice "no tengo permiso" con 401 (scope que falta) o 403: en los dos casos hay que reconectar. */
function sinPermiso(res: Response) {
  return res.status === 401 || res.status === 403
    ? new SpotifyError("Falta un permiso de Spotify: desconectá y volvé a conectar tu cuenta", res.status, true)
    : null;
}

export async function GET() {
  try {
    const { accessToken } = await tokenSpotify();
    const [player, cola] = await Promise.all([spotify(accessToken, "/me/player"), spotify(accessToken, "/me/player/queue")]);
    const error = sinPermiso(player) ?? sinPermiso(cola);
    if (error) throw error;
    if (player.status === 429 || cola.status === 429) throw new SpotifyError("Spotify pidió esperar un poco", 429);

    // 204: no hay nada sonando en ningún dispositivo.
    const estado =
      player.status === 200
        ? ((await player.json()) as { is_playing: boolean; device?: { name: string; type: string } | null })
        : null;
    const datos = cola.ok ? ((await cola.json()) as { currently_playing: unknown; queue: unknown[] }) : null;

    const respuesta: ColaSpotify = {
      dispositivo: estado?.device ? { nombre: estado.device.name, tipo: estado.device.type } : null,
      sonando: Boolean(estado?.is_playing),
      actual: esTrack(datos?.currently_playing) ? aCancion(datos.currently_playing) : null,
      siguientes: (datos?.queue ?? []).filter(esTrack).slice(0, 10).map(aCancion),
    };
    return NextResponse.json(respuesta, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return responder(e, "No se pudo leer la cola de Spotify");
  }
}

/** Suma una canción a la cola del dispositivo que esté sonando (en un Jam, el de quien lo armó). */
export async function POST(request: NextRequest) {
  const { uri } = ((await request.json().catch(() => ({}))) ?? {}) as { uri?: unknown };
  if (typeof uri !== "string" || !URI_TRACK.test(uri)) {
    return NextResponse.json({ error: "Esa no es una canción de Spotify" }, { status: 400 });
  }
  try {
    const { accessToken } = await tokenSpotify();
    const res = await spotify(accessToken, `/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: "POST" });
    if (res.ok) return NextResponse.json({ ok: true });

    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; reason?: string } };
    if (res.status === 404 || data.error?.reason === "NO_ACTIVE_DEVICE") {
      throw new SpotifyError("No hay nada sonando: poné play en Spotify (o arrancá el Jam) y probá de nuevo", 409);
    }
    if (data.error?.reason === "PREMIUM_REQUIRED") throw new SpotifyError("Sumar a la cola necesita Spotify Premium", 403);
    if (res.status === 429) throw new SpotifyError("Spotify pidió esperar un poco", 429);
    throw sinPermiso(res) ?? new SpotifyError(`Spotify no sumó la canción (${data.error?.message ?? res.status})`, 502);
  } catch (e) {
    return responder(e, "No se pudo sumar la canción a la cola");
  }
}
