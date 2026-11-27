import type { NextRequest } from "next/server";
import { conImap, estadoCarpeta } from "@/lib/correo/imap.server";
import { carpetaYUid, conCuenta, responder, responderError } from "@/lib/correo/ruta.server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Lo mínimo de una carpeta (cuántos hay, cuántos sin leer, el próximo uid): la página lo mira seguido para ver si llegó algo. */
export async function GET(request: NextRequest) {
  try {
    const { carpeta } = carpetaYUid(request.nextUrl);
    const { cuenta } = await conCuenta();
    return responder(await conImap(cuenta, (imap) => estadoCarpeta(imap, carpeta)));
  } catch (e) {
    return responderError(e);
  }
}
