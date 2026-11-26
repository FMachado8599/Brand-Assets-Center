import { NextResponse } from "next/server";
import { youtubeStatus } from "@/lib/downloads/youtube.server";

// Lee el Blob store y le pregunta a la PC en cada pedido: el servicio se prende y se apaga.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /api/descargas/youtube/estado → { disponible } o { disponible: false, motivo, mensaje }: si el servicio de la PC está prendido. */
export async function GET() {
  try {
    return NextResponse.json(await youtubeStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[descargas/youtube/estado]", err);
    return NextResponse.json(
      { disponible: false, motivo: "apagado", mensaje: "No pude revisar si el servicio de YouTube está prendido." },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
