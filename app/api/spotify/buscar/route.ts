import { NextResponse, type NextRequest } from "next/server";
import { SPOTIFY_API, SpotifyError } from "@/lib/spotify/auth";
import { aCancion, esTrack } from "@/lib/spotify/catalogo";
import { tokenDelDJ } from "@/lib/spotify/jam";
import { respuestaDeError } from "@/lib/spotify/respuesta";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Canciones del catálogo, buscadas con la cuenta del DJ. En Development Mode Spotify devuelve 10 como mucho. */
export async function GET(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100);
  if (!q) return NextResponse.json({ canciones: [] });

  try {
    const accessToken = await tokenDelDJ(createSupabaseServer());
    const url = new URL(`${SPOTIFY_API()}/v1/search`);
    // market=from_token: el país del DJ, así is_playable dice si se puede escuchar en el Jam.
    url.search = new URLSearchParams({ q, type: "track", limit: "10", market: "from_token" }).toString();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (res.status === 429) throw new SpotifyError("Spotify pidió esperar un poco antes de seguir buscando", 429);
    if (res.status === 401 || res.status === 403) throw new SpotifyError("Spotify no dejó buscar con la cuenta del DJ", 409, true);
    if (!res.ok) throw new SpotifyError(`Spotify no pudo buscar (${res.status})`, 502);

    const data = (await res.json()) as { tracks?: { items: unknown[] } };
    const canciones = (data.tracks?.items ?? []).filter(esTrack).map(aCancion);
    return NextResponse.json({ canciones }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return respuestaDeError(e, "No se pudo buscar en Spotify");
  }
}
