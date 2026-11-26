import { NextResponse } from "next/server";
import { SpotifyError } from "./auth";

/** La respuesta de error de las rutas de Spotify: el mensaje para mostrar, nunca tokens ni el cuerpo crudo. */
export function respuestaDeError(e: unknown, generico: string) {
  const error = e instanceof SpotifyError ? e : new SpotifyError(generico, 502);
  if (!(e instanceof SpotifyError)) console.error(`[spotify] ${generico}:`, (e as Error)?.message);
  return NextResponse.json({ error: error.message, reconectar: error.reconectar }, { status: error.status });
}
