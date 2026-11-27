import { conImap, remitentesRecientes } from "@/lib/correo/imap.server";
import { conCuenta, responder, responderError } from "@/lib/correo/ruta.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cuántos mails de Recibidos se miran para armar la lista (los últimos). */
const CUANTOS = 500;

/** Los que te escribieron últimamente (de tus últimos 500 mails en Recibidos), para ponerles foto. */
export async function GET() {
  try {
    const { cuenta } = await conCuenta();
    const remitentes = await conImap(cuenta, (imap) => remitentesRecientes(imap, "INBOX", CUANTOS, cuenta.email.toLowerCase()));
    return responder({ remitentes, mirados: CUANTOS });
  } catch (e) {
    return responderError(e);
  }
}
