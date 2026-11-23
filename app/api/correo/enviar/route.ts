import type { NextRequest } from "next/server";
import { enviarMail } from "@/lib/correo/enviar.server";
import { CorreoError } from "@/lib/correo/imap.server";
import { conCuenta, mismoOrigen, otroOrigen, responder, responderError } from "@/lib/correo/ruta.server";
import { MAX_ADJUNTOS_BYTES, type DatosEnvio, type ModoEnvio } from "@/lib/correo/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODOS: ModoEnvio[] = ["nuevo", "responder", "responder_todos", "reenviar"];
const MAIL = /^[^@\s<>,;"]+@[^@\s<>,;"]+\.[^@\s<>,;"]+$/;

function direcciones(v: unknown, campo: string): string[] {
  if (!Array.isArray(v)) return [];
  const lista = v.map((x) => (typeof x === "string" ? x.trim().toLowerCase() : "")).filter(Boolean);
  const mala = lista.find((d) => !MAIL.test(d) || d.length > 200);
  if (mala) throw new CorreoError(`"${mala}" no es un mail válido (${campo})`, "otro", 400);
  return [...new Set(lista)];
}

/**
 * Mandar un mail. Llega como formulario: "datos" (JSON con DatosEnvio) y los archivos en "adjuntos".
 * Todo junto tiene que entrar en 4,5 MB (el tope de Vercel por pedido).
 */
export async function POST(request: NextRequest) {
  if (!mismoOrigen(request)) return otroOrigen();
  try {
    const form = await request.formData().catch(() => null);
    if (!form) throw new CorreoError("El mail es demasiado pesado: probá con adjuntos más livianos (hasta 4 MB en total)", "otro", 413);
    const crudo = JSON.parse(String(form.get("datos") ?? "null")) as Partial<DatosEnvio> | null;
    if (!crudo) throw new CorreoError("Pedido incompleto", "otro", 400);

    const datos: DatosEnvio = {
      para: direcciones(crudo.para, "Para"),
      cc: direcciones(crudo.cc, "CC"),
      cco: direcciones(crudo.cco, "CCO"),
      asunto: typeof crudo.asunto === "string" ? crudo.asunto.replace(/[\r\n]+/g, " ").slice(0, 500) : "",
      html: typeof crudo.html === "string" ? crudo.html.slice(0, 2_000_000) : "",
      texto: typeof crudo.texto === "string" ? crudo.texto.slice(0, 1_000_000) : "",
      modo: MODOS.find((m) => m === crudo.modo) ?? "nuevo",
    };
    const o = crudo.original;
    if (o && typeof o.carpeta === "string" && o.carpeta.length <= 300 && Number.isInteger(o.uid) && o.uid > 0) {
      datos.original = { carpeta: o.carpeta, uid: o.uid };
    }
    if (!datos.para.length && !datos.cc.length && !datos.cco.length) throw new CorreoError("Falta a quién mandarlo", "otro", 400);
    if (datos.para.length + datos.cc.length + datos.cco.length > 100) throw new CorreoError("Son demasiados destinatarios (hasta 100)", "otro", 400);

    const archivos: { nombre: string; tipo: string; contenido: Buffer }[] = [];
    let total = 0;
    for (const f of form.getAll("adjuntos")) {
      if (typeof f === "string") continue;
      total += f.size;
      if (total > MAX_ADJUNTOS_BYTES) throw new CorreoError("Los adjuntos pasan los 4 MB: mandá los más pesados por otro lado (ej: un link al Drive)", "otro", 413);
      archivos.push({ nombre: f.name || "adjunto", tipo: f.type || "application/octet-stream", contenido: Buffer.from(await f.arrayBuffer()) });
    }

    const { cuenta } = await conCuenta();
    const r = await enviarMail(cuenta, datos, archivos);
    return responder({ ok: true, guardado: r.guardado });
  } catch (e) {
    return responderError(e);
  }
}
