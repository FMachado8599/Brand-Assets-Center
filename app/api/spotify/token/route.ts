import { NextResponse } from "next/server";
import { SpotifyError } from "@/lib/spotify/auth";
import { tokenSpotify } from "@/lib/spotify/sesion";

export const dynamic = "force-dynamic";

/** Un access token de una hora para el reproductor del navegador. El refresh token no sale del servidor. */
export async function GET() {
  try {
    const { accessToken, expira } = await tokenSpotify();
    return NextResponse.json({ accessToken, expira }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const error = e instanceof SpotifyError ? e : new SpotifyError("No se pudo renovar la conexión con Spotify", 502);
    return NextResponse.json({ error: error.message, reconectar: error.reconectar }, { status: error.status });
  }
}
