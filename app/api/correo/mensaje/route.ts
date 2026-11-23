import type { NextRequest } from "next/server";
import { accionMensajes, conImap, CorreoError, leerMensaje } from "@/lib/correo/imap.server";
import { carpetaYUid, conCuenta, mismoOrigen, otroOrigen, responder, responderError } from "@/lib/correo/ruta.server";
import type { AccionMensaje } from "@/lib/correo/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Un mail completo. Abrirlo lo marca como leído (como en Outlook). */
export async function GET(request: NextRequest) {
  try {
    const { carpeta, uid } = carpetaYUid(request.nextUrl);
    if (!uid) throw new CorreoError("Falta qué mail abrir", "otro", 400);
    const { cuenta } = await conCuenta();
    return responder(await conImap(cuenta, (imap) => leerMensaje(imap, carpeta, uid)));
  } catch (e) {
    return responderError(e);
  }
}

const ACCIONES: AccionMensaje[] = ["leido", "no_leido", "destacar", "quitar_destacado", "archivar", "papelera", "mover"];

/** Marcar leído o no, destacar, archivar, mandar a la Papelera o mover, uno o varios a la vez. */
export async function PATCH(request: NextRequest) {
  if (!mismoOrigen(request)) return otroOrigen();
  try {
    const body = (await request.json().catch(() => null)) as { carpeta?: unknown; uids?: unknown; accion?: unknown; destino?: unknown } | null;
    const carpeta = typeof body?.carpeta === "string" && body.carpeta.length <= 300 ? body.carpeta : null;
    const uids = Array.isArray(body?.uids) ? body.uids.filter((u): u is number => Number.isInteger(u) && (u as number) > 0) : [];
    const accion = ACCIONES.find((a) => a === body?.accion);
    const destino = typeof body?.destino === "string" && body.destino.length <= 300 ? body.destino : undefined;
    if (!carpeta || !uids.length || uids.length > 500 || !accion) throw new CorreoError("Pedido incompleto", "otro", 400);
    const { cuenta } = await conCuenta();
    await conImap(cuenta, (imap) => accionMensajes(imap, carpeta, uids, accion, destino));
    return responder({ ok: true });
  } catch (e) {
    return responderError(e);
  }
}
