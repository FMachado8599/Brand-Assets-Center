import { NextResponse, type NextRequest } from "next/server";
import { SPOTIFY_API, SpotifyError } from "@/lib/spotify/auth";
import { tokenSpotify } from "@/lib/spotify/sesion";
import { aCancion, esTrack } from "@/lib/spotify/catalogo";

export const dynamic = "force-dynamic";

/** Canciones del catálogo, con la cuenta de quien busca. En Development Mode Spotify devuelve 10 como mucho. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100);
  if (!q) return NextResponse.json({ canciones: [] });

  try {
    const { accessToken } = await tokenSpotify();
    const url = new URL(`${SPOTIFY_API()}/v1/search`);
    // market=from_token: el país de la cuenta, así is_playable dice si esa persona la puede escuchar.
    url.search = new URLSearchParams({ q, type: "track", limit: "10", market: "from_token" }).toString();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (res.status === 429) throw new SpotifyError("Spotify pidió esperar un poco antes de seguir buscando", 429);
    if (res.status === 403) throw new SpotifyError("Spotify no habilitó la búsqueda para esta cuenta o esta app", 403);
    if (!res.ok) throw new SpotifyError(`Spotify no pudo buscar (${res.status})`, 502);

    const data = (await res.json()) as { tracks?: { items: unknown[] } };
    const canciones = (data.tracks?.items ?? []).filter(esTrack).map(aCancion);
    return NextResponse.json({ canciones }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const error = e instanceof SpotifyError ? e : new SpotifyError("No se pudo buscar en Spotify", 502);
    return NextResponse.json({ error: error.message, reconectar: error.reconectar }, { status: error.status });
  }
}
