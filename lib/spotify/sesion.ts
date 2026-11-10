import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { decrypt, encrypt, randomState } from "@/lib/integraciones/crypto";
import { createSupabaseServer, safeNext } from "@/lib/supabase-server";
import { renovarToken, SpotifyError } from "./auth";
import type { CuentaSpotify } from "./types";

/**
 * Prueba (fase 1): la conexión con Spotify vive en una cookie httpOnly cifrada con
 * INTEGRACIONES_SECRET. El navegador la guarda pero no la puede leer, y está atada al usuario de
 * la app: si en esa compu entra otra persona, no hereda el Spotify de la anterior.
 * En la fase 2 pasa a una tabla de Supabase con RLS (la cookie no viaja entre computadoras).
 */

const COOKIE = "spotify_conexion";
const STATE_COOKIE = "oauth_spotify";
/** El refresh token de Spotify vence a los 6 meses de autorizar, aunque se renueve el access token. */
const SEIS_MESES = 60 * 60 * 24 * 182;
/** Se renueva un minuto antes de que venza, así el reproductor nunca recibe un token por vencer. */
const MARGEN_MS = 60_000;

type Guardada = {
  /** Usuario de la app (Supabase) dueño de esta conexión. */
  u: string;
  id: string;
  nombre: string;
  rt: string;
  at: string;
  /** Vencimiento del access token (ms). */
  exp: number;
};

const opciones = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

async function usuarioApp() {
  const { data } = await createSupabaseServer().auth.getClaims();
  return typeof data?.claims?.sub === "string" ? data.claims.sub : null;
}

async function leer(): Promise<Guardada | null> {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const guardada = JSON.parse(decrypt(raw)) as Guardada;
    return guardada.u === (await usuarioApp()) ? guardada : null;
  } catch {
    // Cifrada con otra clave o rota: es como no estar conectado.
    return null;
  }
}

function guardar(c: Guardada) {
  cookies().set(COOKIE, encrypt(JSON.stringify(c)), opciones(SEIS_MESES));
}

export function borrarSpotify() {
  cookies().delete(COOKIE);
}

/** La cuenta de Spotify conectada por quien hace el pedido, sin tokens. Sirve también desde una página. */
export async function cuentaSpotify(): Promise<CuentaSpotify | null> {
  const c = await leer();
  return c && { id: c.id, nombre: c.nombre };
}

export async function guardarSpotify(cuenta: CuentaSpotify, tokens: { access_token: string; refresh_token?: string; expires_in: number }) {
  const u = await usuarioApp();
  if (!u) throw new SpotifyError("Iniciá sesión en la app antes de conectar Spotify", 401);
  if (!tokens.refresh_token) throw new SpotifyError("Spotify no entregó un refresh token", 502);
  guardar({ u, ...cuenta, rt: tokens.refresh_token, at: tokens.access_token, exp: Date.now() + tokens.expires_in * 1000 });
}

/** Un access token vigente para el reproductor (lo renueva si hace falta). */
export async function tokenSpotify() {
  const c = await leer();
  if (!c) throw new SpotifyError("Conectá tu cuenta de Spotify", 401, true);
  if (c.exp - Date.now() > MARGEN_MS) return { accessToken: c.at, expira: c.exp };
  try {
    const t = await renovarToken(c.rt);
    // Spotify a veces manda un refresh token nuevo; si no, sigue valiendo el anterior.
    const nueva = { ...c, at: t.access_token, rt: t.refresh_token ?? c.rt, exp: Date.now() + t.expires_in * 1000 };
    guardar(nueva);
    return { accessToken: nueva.at, expira: nueva.exp };
  } catch (e) {
    if (e instanceof SpotifyError && e.reconectar) borrarSpotify();
    throw e;
  }
}

/**
 * El state de OAuth viaja en una cookie de 10 minutos: al volver de Spotify se compara con el
 * que traen ellos (así nadie puede colgar su cuenta en la nuestra) y se sabe a qué pantalla volver.
 */
export function empezarOAuth(request: NextRequest, authorizeUrl: (state: string) => string) {
  const state = randomState();
  const volver = safeNext(request.nextUrl.searchParams.get("volver"));
  const response = NextResponse.redirect(authorizeUrl(state));
  response.cookies.set(STATE_COOKIE, JSON.stringify({ state, volver }), opciones(600));
  return response;
}

/** Valida el state y devuelve a dónde volver; null si no coincide (o expiró). */
export function terminarOAuth(request: NextRequest) {
  const raw = request.cookies.get(STATE_COOKIE)?.value;
  const state = request.nextUrl.searchParams.get("state");
  if (!raw || !state) return null;
  try {
    const saved = JSON.parse(raw) as { state: string; volver: string };
    return saved.state === state ? safeNext(saved.volver) : null;
  } catch {
    return null;
  }
}

/** Vuelve a la pantalla de origen con el resultado en la URL (?spotify=conectado o ?spotify=error&motivo=…). */
export function volverCon(request: NextRequest, volver: string, resultado: string, motivo?: string) {
  const url = new URL(volver, request.url);
  url.searchParams.set("spotify", resultado);
  if (motivo) url.searchParams.set("motivo", motivo.slice(0, 200));
  const response = NextResponse.redirect(url);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
