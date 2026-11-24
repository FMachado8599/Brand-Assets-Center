import type { NextRequest } from "next/server";
import { busquedaDeCliente } from "@/lib/correo/clientes.server";
import { conImap, listarCarpetas, listarMensajes } from "@/lib/correo/imap.server";
import { conCuenta, responder, responderError } from "@/lib/correo/ruta.server";
import type { MailDeCliente } from "@/lib/correo/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CUANTOS = 8;

/**
 * Tus últimos mails con un cliente (los que te mandaron y los que mandaste), para su ficha. Se buscan en
 * tu casilla en el momento: la app no los guarda.
 */
export async function GET(request: NextRequest) {
  try {
    const brand = request.nextUrl.searchParams.get("brand")?.trim() ?? "";
    const { db, cuenta } = await conCuenta();
    const filtro = await busquedaDeCliente(db, brand);
    if (!filtro) return responder({ mails: [], sinDirecciones: true });
    const mails = await conImap(cuenta, async (imap) => {
      const carpetas = await listarCarpetas(imap);
      const enviados = carpetas.find((c) => c.tipo === "sent");
      const donde = [{ path: "INBOX", enviado: false }, ...(enviados ? [{ path: enviados.path, enviado: true }] : [])];
      const todos: MailDeCliente[] = [];
      for (const c of donde) {
        const r = await listarMensajes(imap, c.path, 0, CUANTOS, undefined, filtro);
        todos.push(...r.mensajes.map((m) => ({ ...m, carpeta: c.path, enviado: c.enviado })));
      }
      return todos.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, CUANTOS);
    });
    return responder({ mails, sinDirecciones: false });
  } catch (e) {
    return responderError(e);
  }
}
