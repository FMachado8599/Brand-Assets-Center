import type { NextRequest } from "next/server";
import { canjearCodigo, perfilSpotify, spotifyRedirectUri } from "@/lib/spotify/auth";
import { guardarDJ } from "@/lib/spotify/jam";
import { terminarOAuth, volverCon } from "@/lib/spotify/oauth";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Vuelta de Spotify: se canjea el código y quien conectó su cuenta queda como DJ del Jam. */
export async function GET(request: NextRequest) {
  const volver = terminarOAuth(request);
  if (!volver) return volverCon(request, "/spotify", "error", "El pedido venció o no coincide. Probá de nuevo.");

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    const motivo = request.nextUrl.searchParams.get("error");
    const detalle = request.nextUrl.searchParams.get("error_description");
    if (motivo === "access_denied") return volverCon(request, volver, "error", "No autorizaste la conexión");
    return volverCon(
      request,
      volver,
      "error",
      `Spotify no autorizó la conexión (${[motivo ?? "sin motivo", detalle].filter(Boolean).join(": ")}). Revisá que la Redirect URI esté guardada y que tu cuenta esté en User Management`
    );
  }

  try {
    const tokens = await canjearCodigo(code, spotifyRedirectUri(request));
    const cuenta = await perfilSpotify(tokens.access_token);
    await guardarDJ(createSupabaseServer(), cuenta, tokens);
    return volverCon(request, volver, "conectado");
  } catch (e) {
    return volverCon(request, volver, "error", (e as Error).message);
  }
}
