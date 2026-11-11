import { NextResponse, type NextRequest } from "next/server";
import { randomState } from "@/lib/integraciones/crypto";
import { safeNext } from "@/lib/supabase-server";
import { origenDe } from "./auth";

/**
 * El state de OAuth viaja en una cookie de 10 minutos: al volver de Spotify se compara con el
 * que traen ellos (así nadie puede colgar su cuenta en la nuestra) y se sabe a qué pantalla volver.
 */

const STATE_COOKIE = "oauth_spotify";

export function empezarOAuth(request: NextRequest, authorizeUrl: (state: string) => string) {
  const state = randomState();
  const volver = safeNext(request.nextUrl.searchParams.get("volver"));
  const response = NextResponse.redirect(authorizeUrl(state));
  response.cookies.set(STATE_COOKIE, JSON.stringify({ state, volver }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
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
  const url = new URL(volver, origenDe(request));
  url.searchParams.set("spotify", resultado);
  if (motivo) url.searchParams.set("motivo", motivo.slice(0, 200));
  const response = NextResponse.redirect(url);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
