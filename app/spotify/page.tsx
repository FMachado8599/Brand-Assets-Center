import type { Metadata } from "next";
import { SpotifyPrueba } from "@/components/spotify/SpotifyPrueba";
import { hasSpotifyEnv } from "@/lib/spotify/auth";
import { cuentaSpotify } from "@/lib/spotify/sesion";

// La conexión es de cada persona (cookie): no se puede armar la página de antemano.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Spotify (prueba)",
  description: "Prueba técnica: conectar Spotify y reproducir en el navegador.",
};

/**
 * Fase 1 de la integración con Spotify: una página suelta (no está en la sidebar) para probar
 * OAuth + Web Playback SDK con una cuenta. Todavía no hay widget global, cola ni radio.
 */
export default async function SpotifyPage() {
  const configurado = hasSpotifyEnv();
  const cuenta = configurado ? await cuentaSpotify() : null;
  return <SpotifyPrueba configurado={configurado} cuenta={cuenta} />;
}
