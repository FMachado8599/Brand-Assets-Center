import type { NextRequest } from "next/server";
import { busquedaDeCliente } from "@/lib/correo/clientes.server";
import { conImap, listarMensajes } from "@/lib/correo/imap.server";
import { carpetaYUid, conCuenta, responder, responderError } from "@/lib/correo/ruta.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POR_PAGINA = 50;

/**
 * Los mails de una carpeta, de a 50 y los últimos primero. Con ?q= busca en el asunto, la gente y el
 * texto; con ?cliente= (el id de un cliente), solo los de sus mails y dominios.
 */
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const { carpeta } = carpetaYUid(url);
    const pagina = Math.max(0, Math.min(10_000, Number(url.searchParams.get("pagina")) || 0));
    const q = url.searchParams.get("q")?.trim().slice(0, 200) || undefined;
    const cliente = url.searchParams.get("cliente")?.trim() || null;
    const { db, cuenta } = await conCuenta();
    const filtro = cliente ? await busquedaDeCliente(db, cliente) : undefined;
    // Un cliente sin mails cargados no tiene mails: la lista vuelve vacía en vez de mostrar todo.
    if (cliente && !filtro) return responder({ carpeta, total: 0, pagina, porPagina: POR_PAGINA, mensajes: [] });
    return responder(await conImap(cuenta, (imap) => listarMensajes(imap, carpeta, pagina, POR_PAGINA, q, filtro ?? undefined)));
  } catch (e) {
    return responderError(e);
  }
}
