import { conImap, listarCarpetas } from "@/lib/correo/imap.server";
import { conCuenta, responder, responderError } from "@/lib/correo/ruta.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Las carpetas de tu casilla, con cuántos sin leer tiene cada una. */
export async function GET() {
  try {
    const { cuenta } = await conCuenta();
    const carpetas = await conImap(cuenta, listarCarpetas);
    return responder({ carpetas });
  } catch (e) {
    return responderError(e);
  }
}
