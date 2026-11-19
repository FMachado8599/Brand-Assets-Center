import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/supabase-server";
import { randomState } from "./crypto";
import type { Proveedor } from "./store";

/**
 * El state de OAuth viaja en una cookie de 10 minutos: al volver de Basecamp o de Google se
 * compara con el que traen ellos (así nadie puede colgar su cuenta en la nuestra) y se sabe a
 * qué pantalla volver.
 */

const cookieName = (p: Proveedor) => `oauth_${p}`;

type Guardado = { state: string; volver: string; invitacion?: string };

/**
 * volver: a qué pantalla volver (si no, el ?volver= del pedido). invitacion: la llave del link con el
 * que alguien autoriza sin entrar a la app (Basecamp), para usarla a la vuelta.
 */
export function empezarOAuth(
  request: NextRequest,
  proveedor: Proveedor,
  authorizeUrl: (state: string) => string,
  opciones: { volver?: string; invitacion?: string } = {}
) {
  const state = randomState();
  const volver = safeNext(opciones.volver ?? request.nextUrl.searchParams.get("volver"));
  const response = NextResponse.redirect(authorizeUrl(state));
  const guardado: Guardado = { state, volver, ...(opciones.invitacion ? { invitacion: opciones.invitacion } : {}) };
  response.cookies.set(cookieName(proveedor), JSON.stringify(guardado), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}

/** Valida el state y devuelve a dónde volver y el link con el que se autorizó (si hubo); null si no coincide (o expiró). */
export function leerOAuth(request: NextRequest, proveedor: Proveedor): { volver: string; invitacion: string | null } | null {
  const raw = request.cookies.get(cookieName(proveedor))?.value;
  const state = request.nextUrl.searchParams.get("state");
  if (!raw || !state) return null;
  try {
    const saved = JSON.parse(raw) as Guardado;
    return saved.state === state ? { volver: safeNext(saved.volver), invitacion: saved.invitacion ?? null } : null;
  } catch {
    return null;
  }
}

/** Valida el state y devuelve a dónde volver; null si no coincide (o expiró). */
export function terminarOAuth(request: NextRequest, proveedor: Proveedor) {
  return leerOAuth(request, proveedor)?.volver ?? null;
}

/** Vuelve a la pantalla de origen con el resultado en la URL (?basecamp=conectado o ?google=error&motivo=…). */
export function volverCon(request: NextRequest, proveedor: Proveedor, volver: string, resultado: string, motivo?: string) {
  const url = new URL(volver, request.url);
  url.searchParams.set(proveedor, resultado);
  if (motivo) url.searchParams.set("motivo", motivo.slice(0, 200));
  const response = NextResponse.redirect(url);
  response.cookies.delete(cookieName(proveedor));
  return response;
}
