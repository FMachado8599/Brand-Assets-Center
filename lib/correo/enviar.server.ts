import "server-only";
import { randomUUID } from "crypto";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import type Mail from "nodemailer/lib/mailer";
import type { ParsedMail } from "mailparser";
import { CORREO } from "./config";
import { conImap, guardarEnviado, marcarFlag, traducirError, traerMail, type CuentaCorreo } from "./imap.server";
import type { DatosEnvio } from "./types";

/**
 * Mandar un mail: sale por el SMTP de la casilla (así llega desde @camaratbwa.com y no cae en spam),
 * queda una copia en Enviados y, si era una respuesta, el original queda marcado como respondido.
 * Al responder se cita el original; al reenviar, además, van sus adjuntos.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fechaLarga = (d?: Date) =>
  d ? new Intl.DateTimeFormat("es-UY", { dateStyle: "full", timeStyle: "short", timeZone: "America/Montevideo" }).format(d) : "";

const listaTexto = (a: ParsedMail["to"]) =>
  (Array.isArray(a) ? a : a ? [a] : [])
    .flatMap((o) => o.value)
    .map((v) => (v.name ? `${v.name} <${v.address}>` : v.address ?? ""))
    .filter(Boolean)
    .join(", ");

/** Solo lo de adentro del <body> (el <head> del original no va adentro de otro mail). */
function cuerpoHtml(p: ParsedMail) {
  if (typeof p.html === "string") {
    const m = p.html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    return m ? m[1] : p.html;
  }
  return esc(p.text ?? "").replace(/\n/g, "<br>");
}

function cita(p: ParsedMail, modo: DatosEnvio["modo"]) {
  const de = listaTexto(p.from);
  if (modo === "reenviar") {
    const cabecera = [
      ["De", de],
      ["Enviado", fechaLarga(p.date)],
      ["Para", listaTexto(p.to)],
      ["CC", listaTexto(p.cc)],
      ["Asunto", p.subject ?? ""],
    ].filter(([, v]) => v);
    return {
      html:
        `<br><div>---------- Mensaje reenviado ----------<br>` +
        cabecera.map(([k, v]) => `<b>${k}:</b> ${esc(v)}`).join("<br>") +
        `</div><br>${cuerpoHtml(p)}`,
      texto: `\n\n---------- Mensaje reenviado ----------\n${cabecera.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${p.text ?? ""}`,
    };
  }
  const intro = `El ${fechaLarga(p.date)}, ${de} escribió:`;
  return {
    html: `<br><div>${esc(intro)}</div><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${cuerpoHtml(p)}</blockquote>`,
    texto: `\n\n${intro}\n${(p.text ?? "").split("\n").map((l) => `> ${l}`).join("\n")}`,
  };
}

export async function enviarMail(
  cuenta: CuentaCorreo & { nombre: string | null },
  datos: DatosEnvio,
  archivos: { nombre: string; tipo: string; contenido: Buffer }[]
) {
  const messageId = `<${randomUUID()}@${CORREO.dominio}>`;
  const mail: Mail.Options = {
    messageId,
    date: new Date(),
    from: cuenta.nombre ? { name: cuenta.nombre, address: cuenta.email } : cuenta.email,
    to: datos.para,
    cc: datos.cc.length ? datos.cc : undefined,
    bcc: datos.cco.length ? datos.cco : undefined,
    subject: datos.asunto,
    html: datos.html,
    text: datos.texto,
    attachments: archivos.map((a) => ({ filename: a.nombre, contentType: a.tipo, content: a.contenido })),
  };

  // El original (si es respuesta o reenvío): para citarlo, encadenar la conversación y, al reenviar, sus adjuntos.
  if (datos.original && datos.modo !== "nuevo") {
    const { carpeta, uid } = datos.original;
    const { parsed } = await conImap(cuenta, (imap) => traerMail(imap, carpeta, uid, { keepCid: true }));
    const c = cita(parsed, datos.modo);
    mail.html = `${datos.html}${c.html}`;
    mail.text = `${datos.texto}${c.texto}`;
    const originales = parsed.attachments
      // Al responder solo van las imágenes del texto citado; al reenviar, todo.
      .filter((a) => datos.modo === "reenviar" || (a.related && a.cid))
      .map((a) => ({ filename: a.filename, contentType: a.contentType, content: a.content, cid: a.related ? a.cid : undefined }));
    mail.attachments = [...(mail.attachments ?? []), ...originales];
    if (datos.modo !== "reenviar" && parsed.messageId) {
      const refs = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [];
      mail.inReplyTo = parsed.messageId;
      mail.references = [...refs, parsed.messageId];
    }
  }

  // El mismo mail dos veces: el que sale (sin CCO en las cabeceras) y la copia de Enviados (con CCO, como Outlook).
  const salida = await new MailComposer(mail).compile().build();
  const copiaNodo = new MailComposer(mail).compile();
  copiaNodo.keepBcc = true;
  const copia = await copiaNodo.build();

  const smtp = nodemailer.createTransport({
    host: CORREO.smtp.host,
    port: CORREO.smtp.port,
    secure: CORREO.smtp.port === 465,
    auth: { user: cuenta.email, pass: cuenta.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
  try {
    await smtp.sendMail({ envelope: { from: cuenta.email, to: [...datos.para, ...datos.cc, ...datos.cco] }, raw: salida });
  } catch (e) {
    throw traducirError(e, CORREO.smtp.host);
  } finally {
    smtp.close();
  }

  // Ya salió: si guardar la copia o marcar el original falla, no es para decir que no se mandó.
  let guardado = false;
  try {
    guardado = await conImap(cuenta, async (imap) => {
      const ok = await guardarEnviado(imap, copia);
      if (datos.original && datos.modo !== "nuevo") {
        await marcarFlag(imap, datos.original.carpeta, datos.original.uid, datos.modo === "reenviar" ? "$Forwarded" : "\\Answered").catch(() => {});
      }
      return ok;
    });
  } catch {
    guardado = false;
  }
  return { messageId, guardado };
}
