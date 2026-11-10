import { NextResponse } from "next/server";
import { borrarSpotify } from "@/lib/spotify/sesion";

export const dynamic = "force-dynamic";

/**
 * Se olvida la conexión en la app. Para revocar el permiso del todo, cada persona lo hace desde su
 * cuenta (spotify.com/account/apps): Spotify no tiene un endpoint para revocar tokens.
 */
export function POST() {
  borrarSpotify();
  return NextResponse.json({ ok: true });
}
