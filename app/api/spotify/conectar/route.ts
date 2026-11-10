import { NextResponse, type NextRequest } from "next/server";
import { hasSpotifyEnv, spotifyAuthorizeUrl, spotifyRedirectUri } from "@/lib/spotify/auth";
import { empezarOAuth, volverCon } from "@/lib/spotify/sesion";
import { safeNext } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Manda a Spotify a autorizar la cuenta de quien la conecta. */
export function GET(request: NextRequest) {
  if (!hasSpotifyEnv()) {
    return NextResponse.json(
      { error: "Faltan SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET o INTEGRACIONES_SECRET en el servidor" },
      { status: 503 }
    );
  }
  const redirectUri = spotifyRedirectUri(request.url);
  if (new URL(redirectUri).hostname === "localhost") {
    const volver = safeNext(request.nextUrl.searchParams.get("volver"));
    return volverCon(request, volver, "error", "Spotify no acepta localhost: abrí la app en http://127.0.0.1:3000");
  }
  return empezarOAuth(request, (state) => spotifyAuthorizeUrl(redirectUri, state));
}
