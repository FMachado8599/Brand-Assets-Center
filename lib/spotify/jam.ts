import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/integraciones/crypto";
import { renovarToken, SPOTIFY_API, SpotifyError } from "./auth";
import { aCancion, esTrack, yaEsta } from "./catalogo";
import type { CancionSpotify, EstadoJam } from "./types";

/**
 * El Jam del estudio (supabase/migracion-spotify.sql): una sola fila con el DJ y su conexión.
 * Todo pasa con la sesión de quien hace el pedido (RLS: solo el estudio); los tokens viajan
 * cifrados hasta acá y se descifran recién en el servidor.
 */

type Fila = {
  dj_user: string;
  dj_nombre: string | null;
  spotify_id: string;
  spotify_nombre: string | null;
  access_token: string;
  refresh_token: string;
  expira: string;
  jam_link: string | null;
};

/** Se renueva un minuto antes de que venza. */
const MARGEN_MS = 60_000;
/**
 * Lo que suena se le pregunta a Spotify como mucho cada 5 s, sin importar cuántas burbujas estén
 * abiertas: todas comparten la misma respuesta (por instancia del servidor).
 */
const CACHE_MS = 5_000;

function errorDeBase(error: { code?: string; message: string }) {
  if (error.code === "42P01" || error.code === "PGRST205" || /spotify_jam/.test(error.message)) {
    return new SpotifyError("Falta crear el Jam en la base: corré supabase/migracion-spotify.sql", 503);
  }
  return new SpotifyError(`No se pudo leer el Jam (${error.message})`, 502);
}

async function leerFila(db: SupabaseClient) {
  const { data, error } = await db.from("spotify_jam").select("*").eq("id", 1).maybeSingle<Fila>();
  if (error) throw errorDeBase(error);
  return data;
}

/** Quién hace el pedido en la app. */
export async function quienPide(db: SupabaseClient) {
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  if (typeof claims?.sub !== "string") throw new SpotifyError("Iniciá sesión en la app", 401);
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const nombre = [meta.full_name, meta.name, claims.email].find((v): v is string => typeof v === "string" && v.trim() !== "");
  return { id: claims.sub, nombre: nombre?.trim() ?? "Alguien del estudio" };
}

/** Quien conecta su Spotify pasa a ser el DJ. Si era otra persona, el link anterior ya no sirve. */
export async function guardarDJ(
  db: SupabaseClient,
  cuenta: { id: string; nombre: string },
  tokens: { access_token: string; refresh_token?: string; expires_in: number }
) {
  if (!tokens.refresh_token) throw new SpotifyError("Spotify no entregó un refresh token", 502);
  const yo = await quienPide(db);
  const antes = await leerFila(db);
  const { error } = await db.from("spotify_jam").upsert({
    id: 1,
    dj_user: yo.id,
    dj_nombre: yo.nombre,
    spotify_id: cuenta.id,
    spotify_nombre: cuenta.nombre,
    access_token: encrypt(tokens.access_token),
    refresh_token: encrypt(tokens.refresh_token),
    expira: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    jam_link: antes?.dj_user === yo.id ? antes.jam_link : null,
    conectado: new Date().toISOString(),
    actualizado: new Date().toISOString(),
  });
  if (error) throw errorDeBase(error);
  olvidarCache();
}

/** Cambiar el link o terminar el Jam: solo el DJ. */
async function soloElDJ(db: SupabaseClient) {
  const [yo, fila] = await Promise.all([quienPide(db), leerFila(db)]);
  if (!fila) throw new SpotifyError("No hay ningún Jam armado", 404);
  if (fila.dj_user !== yo.id) throw new SpotifyError(`Solo el DJ (${fila.dj_nombre ?? "quien armó el Jam"}) puede cambiar esto`, 403);
}

export async function guardarLink(db: SupabaseClient, link: string | null) {
  await soloElDJ(db);
  const { error } = await db.from("spotify_jam").update({ jam_link: link, actualizado: new Date().toISOString() }).eq("id", 1);
  if (error) throw errorDeBase(error);
  olvidarCache();
}

export async function terminarJam(db: SupabaseClient) {
  await soloElDJ(db);
  const { error } = await db.from("spotify_jam").delete().eq("id", 1);
  if (error) throw errorDeBase(error);
  olvidarCache();
}

/** Un access token vigente de la cuenta del DJ (lo renueva y lo guarda si hace falta). */
export async function tokenDelDJ(db: SupabaseClient, fila?: Fila | null) {
  const f = fila === undefined ? await leerFila(db) : fila;
  if (!f) throw new SpotifyError("No hay ningún Jam armado: el DJ tiene que conectar su Spotify en /spotify", 409);
  if (new Date(f.expira).getTime() - Date.now() > MARGEN_MS) return decrypt(f.access_token);
  try {
    const t = await renovarToken(decrypt(f.refresh_token));
    const { error } = await db
      .from("spotify_jam")
      .update({
        access_token: encrypt(t.access_token),
        // Spotify a veces manda un refresh token nuevo; si no, sigue valiendo el anterior.
        ...(t.refresh_token ? { refresh_token: encrypt(t.refresh_token) } : {}),
        expira: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      })
      .eq("id", 1);
    if (error) throw errorDeBase(error);
    return t.access_token;
  } catch (e) {
    if (e instanceof SpotifyError && e.reconectar) {
      throw new SpotifyError(`La conexión de ${f.dj_nombre ?? "el DJ"} con Spotify venció: tiene que volver a conectar en /spotify`, 409, true);
    }
    throw e;
  }
}

async function spotify(accessToken: string, path: string, init?: RequestInit) {
  return fetch(`${SPOTIFY_API()}/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
    cache: "no-store",
  });
}

function revisar(res: Response) {
  if (res.status === 401 || res.status === 403) {
    return new SpotifyError("A la conexión del DJ le falta un permiso: tiene que volver a conectar en /spotify", 409, true);
  }
  if (res.status === 429) return new SpotifyError("Spotify pidió esperar un poco", 429);
  return null;
}

type Sonando = Pick<EstadoJam, "dispositivo" | "sonando" | "actual" | "progreso" | "siguientes">;

async function leerSonando(accessToken: string): Promise<Sonando> {
  const [player, cola] = await Promise.all([spotify(accessToken, "/me/player"), spotify(accessToken, "/me/player/queue")]);
  const error = revisar(player) ?? revisar(cola);
  if (error) throw error;
  // 204: no suena nada en ningún dispositivo.
  const estado =
    player.status === 200
      ? ((await player.json()) as { is_playing: boolean; progress_ms: number | null; device?: { name: string; type: string } | null })
      : null;
  const datos = cola.ok ? ((await cola.json()) as { currently_playing: unknown; queue: unknown[] }) : null;
  return {
    dispositivo: estado?.device ? { nombre: estado.device.name, tipo: estado.device.type } : null,
    sonando: Boolean(estado?.is_playing),
    actual: esTrack(datos?.currently_playing) ? aCancion(datos.currently_playing) : null,
    progreso: estado?.progress_ms ?? 0,
    siguientes: (datos?.queue ?? []).filter(esTrack).slice(0, 20).map(aCancion),
  };
}

let cache: { at: number; estado: Omit<EstadoJam, "leidoHace"> } | null = null;
let enCurso: Promise<Omit<EstadoJam, "leidoHace">> | null = null;

function olvidarCache() {
  cache = null;
}

const SIN_SONIDO: Sonando = { dispositivo: null, sonando: false, actual: null, progreso: 0, siguientes: [] };

async function leerEstado(db: SupabaseClient): Promise<Omit<EstadoJam, "leidoHace">> {
  const fila = await leerFila(db);
  if (!fila) return { dj: null, link: null, aviso: null, ...SIN_SONIDO };
  const base = {
    dj: { usuario: fila.dj_user, nombre: fila.dj_nombre ?? "Alguien del estudio", spotify: fila.spotify_nombre ?? fila.spotify_id },
    link: fila.jam_link,
  };
  try {
    return { ...base, aviso: null, ...(await leerSonando(await tokenDelDJ(db, fila))) };
  } catch (e) {
    // El Jam existe aunque Spotify no conteste: se muestra con el aviso.
    if (e instanceof SpotifyError) return { ...base, aviso: e.message, ...SIN_SONIDO };
    throw e;
  }
}

/** El estado del Jam, compartido por unos segundos entre todos los que preguntan. */
export async function estadoJam(db: SupabaseClient): Promise<EstadoJam> {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    enCurso ??= leerEstado(db)
      .then((estado) => {
        cache = { at: Date.now(), estado };
        return estado;
      })
      .finally(() => {
        enCurso = null;
      });
    await enCurso;
  }
  const c = cache!;
  return { ...c.estado, leidoHace: Date.now() - c.at };
}

/** Suma una canción a la cola del Jam (la del dispositivo del DJ). No la suma si ya está. */
export async function sumarACola(db: SupabaseClient, cancion: Pick<CancionSpotify, "uri" | "nombre" | "artistas">) {
  const token = await tokenDelDJ(db);
  // Con la cola recién leída, no con la guardada: dos personas pueden estar sumando a la vez.
  const ahora = await leerSonando(token);
  if (!ahora.dispositivo) throw new SpotifyError("En el Spotify del DJ no suena nada: el Jam tiene que estar andando", 409);
  if (yaEsta(cancion, ahora)) throw new SpotifyError("Esa canción ya está en la cola", 409);

  const res = await spotify(token, `/me/player/queue?uri=${encodeURIComponent(cancion.uri)}`, { method: "POST" });
  olvidarCache();
  if (res.ok) return;
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; reason?: string } };
  if (res.status === 404 || data.error?.reason === "NO_ACTIVE_DEVICE") {
    throw new SpotifyError("En el Spotify del DJ no suena nada: el Jam tiene que estar andando", 409);
  }
  if (data.error?.reason === "PREMIUM_REQUIRED") throw new SpotifyError("La cuenta del DJ necesita Spotify Premium", 403);
  throw revisar(res) ?? new SpotifyError(`Spotify no sumó la canción (${data.error?.message ?? res.status})`, 502);
}
