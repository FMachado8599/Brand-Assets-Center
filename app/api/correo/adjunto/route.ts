import type { NextRequest } from "next/server";
import { adjunto, conImap, CorreoError } from "@/lib/correo/imap.server";
import { carpetaYUid, conCuenta, responderError } from "@/lib/correo/ruta.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Solo estas se muestran en el navegador (para las imágenes dentro del texto); todo lo demás se baja.
// SVG no: puede traer código.
const SE_MUESTRAN = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Bajar un adjunto. Lo que viene en un mail es de cualquiera: se sirve aislado y como descarga. */
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const { carpeta, uid } = carpetaYUid(url);
    const i = Number(url.searchParams.get("i"));
    if (!uid || !Number.isInteger(i) || i < 0) throw new CorreoError("Falta qué adjunto bajar", "otro", 400);
    const { cuenta } = await conCuenta();
    const a = await conImap(cuenta, (imap) => adjunto(imap, carpeta, uid, i));
    const tipo = a.tipo.toLowerCase();
    const mostrar = SE_MUESTRAN.has(tipo) && url.searchParams.get("descargar") !== "1";
    const nombre = a.nombre.replace(/[\r\n"]/g, "_");
    return new Response(new Uint8Array(a.contenido), {
      headers: {
        "Content-Type": mostrar ? tipo : "application/octet-stream",
        "Content-Disposition": `${mostrar ? "inline" : "attachment"}; filename="${nombre.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return responderError(e);
  }
}
