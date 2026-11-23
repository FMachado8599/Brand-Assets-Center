import type { NextRequest } from "next/server";
import { conImap, listarMensajes } from "@/lib/correo/imap.server";
import { carpetaYUid, conCuenta, responder, responderError } from "@/lib/correo/ruta.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POR_PAGINA = 50;

/** Los mails de una carpeta, de a 50 y los últimos primero. Con ?q= busca en el asunto, la gente y el texto. */
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const { carpeta } = carpetaYUid(url);
    const pagina = Math.max(0, Math.min(10_000, Number(url.searchParams.get("pagina")) || 0));
    const q = url.searchParams.get("q")?.trim().slice(0, 200) || undefined;
    const { cuenta } = await conCuenta();
    return responder(await conImap(cuenta, (imap) => listarMensajes(imap, carpeta, pagina, POR_PAGINA, q)));
  } catch (e) {
    return responderError(e);
  }
}
