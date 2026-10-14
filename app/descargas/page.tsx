import type { Metadata } from "next";
import { DownloadsShell } from "@/components/downloads/DownloadsShell";

// Lee la configuración de Drive en cada pedido (las variables se pueden cargar sin recompilar).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Descargas",
  description: "Bajá videos y posteos de YouTube, Instagram y Pinterest, a tu compu o a Drive.",
};

export default function DescargasPage() {
  // El mismo cliente de Google que usa Planificación; la API key es la del selector de carpetas (Google Picker).
  // Los dos son públicos por diseño (viajan al navegador): la clave secreta del cliente no se usa acá.
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const apiKey = process.env.GOOGLE_PICKER_API_KEY?.trim();
  return <DownloadsShell drive={clientId && apiKey ? { clientId, apiKey } : null} />;
}
