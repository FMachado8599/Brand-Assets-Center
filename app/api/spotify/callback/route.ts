import type { NextRequest } from "next/server";
import { canjearCodigo, perfilSpotify, spotifyRedirectUri } from "@/lib/spotify/auth";
import { guardarSpotify, terminarOAuth, volverCon } from "@/lib/spotify/sesion";

export const dynamic = "force-dynamic";

/** Vuelta de Spotify: se canjea el código, se lee de qué cuenta es y se guarda la conexión cifrada. */
export async function GET(request: NextRequest) {
  const volver = terminarOAuth(request);
  if (!volver) return volverCon(request, "/spotify", "error", "El pedido venció o no coincide. Probá de nuevo.");

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    const motivo = request.nextUrl.searchParams.get("error");
    return volverCon(request, volver, "error", motivo === "access_denied" ? "No autorizaste la conexión" : motivo ?? "Spotify no autorizó la conexión");
  }

  try {
    const tokens = await canjearCodigo(code, spotifyRedirectUri(request));
    const cuenta = await perfilSpotify(tokens.access_token);
    await guardarSpotify(cuenta, tokens);
    return volverCon(request, volver, "conectado");
  } catch (e) {
    return volverCon(request, volver, "error", (e as Error).message);
  }
}
