import type { NextRequest } from "next/server";
import { CORREO, esDelDominio } from "@/lib/correo/config";
import { conImap, CorreoError } from "@/lib/correo/imap.server";
import { borrarCuenta, guardarCuenta, leerCuenta, mismoOrigen, otroOrigen, responder, responderError, usuarioDelPedido } from "@/lib/correo/ruta.server";
import type { EstadoCuenta } from "@/lib/correo/types";
import { hasSecret } from "@/lib/integraciones/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Si tenés la casilla conectada (sin la contraseña, que nunca sale del servidor). */
export async function GET() {
  try {
    const { db, usuario } = await usuarioDelPedido();
    const puede = esDelDominio(usuario.email);
    const cuenta = puede ? await leerCuenta(db, usuario) : null;
    const estado: EstadoCuenta = {
      conectada: Boolean(cuenta),
      email: usuario.email,
      puede,
      dominio: CORREO.dominio,
      servidor: CORREO.imap.host,
      sinSecreto: !hasSecret(),
    };
    return responder(estado);
  } catch (e) {
    return responderError(e);
  }
}

/** Conectar la casilla: se prueba la contraseña contra el servidor y, si entra, se guarda cifrada. */
export async function POST(request: NextRequest) {
  if (!mismoOrigen(request)) return otroOrigen();
  try {
    const { db, usuario } = await usuarioDelPedido();
    if (!esDelDominio(usuario.email)) throw new CorreoError(`Solo las cuentas @${CORREO.dominio} tienen casilla acá`, "otro", 403);
    if (!hasSecret()) throw new CorreoError("Falta INTEGRACIONES_SECRET en las variables del servidor", "otro", 503);
    const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password || password.length > 200) throw new CorreoError("Poné la contraseña de tu correo", "otro", 400);

    // Si entra, sirve: es la prueba de que la contraseña es la del correo.
    await conImap({ email: usuario.email, password }, async () => true);
    await guardarCuenta(db, usuario, password);
    return responder({ ok: true });
  } catch (e) {
    return responderError(e);
  }
}

/** Desconectar: se borra la contraseña guardada (los mails siguen en el servidor, como siempre). */
export async function DELETE(request: NextRequest) {
  if (!mismoOrigen(request)) return otroOrigen();
  try {
    const { db, usuario } = await usuarioDelPedido();
    await borrarCuenta(db, usuario);
    return responder({ ok: true });
  } catch (e) {
    return responderError(e);
  }
}
