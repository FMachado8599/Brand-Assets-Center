import type { Metadata } from "next";
import { SpotifyJam } from "@/components/spotify/SpotifyJam";
import { ConfirmProvider } from "@/components/ui/confirm";
import { hasSpotifyEnv } from "@/lib/spotify/auth";

// Las variables se pueden cargar sin recompilar.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Spotify",
  description: "El Jam del estudio: qué suena, la cola y para sumar canciones.",
};

/** El Jam entero (lo mismo que la burbuja, más lo del DJ). */
export default function SpotifyPage() {
  return (
    <ConfirmProvider>
      <SpotifyJam configurado={hasSpotifyEnv()} />
    </ConfirmProvider>
  );
}
