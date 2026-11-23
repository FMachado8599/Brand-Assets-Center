import "server-only";
import { ImapFlow, type FetchMessageObject, type ListResponse, type MessageStructureObject } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { CORREO } from "./config";
import type { AccionMensaje, Adjunto, Carpeta, CodigoError, Direccion, EstadoCarpeta, ListaMensajes, Mensaje, MensajeResumen, TipoCarpeta } from "./types";
import { NOMBRES_CARPETA } from "./types";

/**
 * Todo lo que habla con el servidor de correo (IMAP). La app no guarda copia de los mails: cada pedido
 * abre una conexión con la casilla de quien lo hace, hace lo suyo y la cierra. Así lo que se hace acá
 * se ve en Outlook y al revés.
 */

export type CuentaCorreo = { email: string; password: string };

/** Un error para mostrar tal cual en la app, con el código que dice qué hacer (ver CodigoError). */
export class CorreoError extends Error {
  constructor(
    message: string,
    public codigo: CodigoError = "otro",
    public status = 500
  ) {
    super(message);
  }
}

const CONEXION = new Set([
  "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH",
  "ETIMEOUT", "ESOCKET", "ECONNECTION", "NoConnection", "ClosedAfterConnectTLS", "EPIPE",
]);
const CERTIFICADO = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/i;

/** Los errores del servidor de correo (IMAP o SMTP), en castellano y con qué hacer. */
export function traducirError(e: unknown, servidor = CORREO.imap.host): CorreoError {
  if (e instanceof CorreoError) return e;
  const err = (e ?? {}) as { message?: string; code?: string; responseText?: string; authenticationFailed?: boolean; responseCode?: number };
  const texto = `${err.responseText ?? ""} ${err.message ?? ""}`;
  if (err.authenticationFailed || err.code === "EAUTH" || /AUTHENTICATIONFAILED|authentication failed|invalid credentials|535/i.test(texto)) {
    return new CorreoError("El servidor no aceptó la contraseña. Fijate que sea la misma que usás en Outlook.", "auth", 401);
  }
  if (err.code && CERTIFICADO.test(err.code)) {
    return new CorreoError(`El certificado de seguridad de ${servidor} no es válido (${err.code}). Avisale a ProLinux.`, "conexion", 502);
  }
  if ((err.code && CONEXION.has(err.code)) || /timeout|timed out|connect|socket/i.test(err.message ?? "")) {
    return new CorreoError(
      `No pudimos conectarnos con el servidor de correo (${servidor}). Puede estar caído o no aceptar conexiones desde la app.${err.code ? ` (${err.code})` : ""}`,
      "conexion",
      502
    );
  }
  return new CorreoError(err.responseText || err.message || "Algo falló con el servidor de correo", "otro", 500);
}

/** Abre la casilla, hace lo que haga falta y la cierra siempre (aunque algo falle). */
export async function conImap<T>(cuenta: CuentaCorreo, fn: (imap: ImapFlow) => Promise<T>): Promise<T> {
  const imap = new ImapFlow({
    host: CORREO.imap.host,
    port: CORREO.imap.port,
    secure: CORREO.imap.port === 993,
    auth: { user: cuenta.email, pass: cuenta.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 45_000,
  });
  // Sin esto, un corte de la conexión tira un error sin atrapar y se cae la función entera.
  imap.on("error", () => {});
  try {
    await imap.connect();
  } catch (e) {
    throw traducirError(e);
  }
  try {
    return await fn(imap);
  } catch (e) {
    throw traducirError(e);
  } finally {
    await imap.logout().catch(() => imap.close());
  }
}

/* ───────────── Carpetas ───────────── */

const ESPECIALES: Record<string, Exclude<TipoCarpeta, "otra">> = {
  "\\Inbox": "inbox",
  "\\Drafts": "drafts",
  "\\Sent": "sent",
  "\\Archive": "archive",
  "\\Junk": "junk",
  "\\Trash": "trash",
};
const ORDEN: TipoCarpeta[] = ["inbox", "drafts", "sent", "archive", "junk", "trash", "otra"];

const tipoDe = (l: ListResponse): TipoCarpeta => (l.path.toUpperCase() === "INBOX" ? "inbox" : ESPECIALES[l.specialUse ?? ""] ?? "otra");
const seleccionable = (l: ListResponse) => !l.flags.has("\\Noselect") && !l.flags.has("\\NonExistent");

export async function listarCarpetas(imap: ImapFlow): Promise<Carpeta[]> {
  const lista = (await imap.list({ statusQuery: { messages: true, unseen: true } })).filter(seleccionable);
  const vistos = new Set<TipoCarpeta>();
  const carpetas = lista.map((l): Carpeta => {
    let tipo = tipoDe(l);
    // Dos carpetas del mismo tipo (ej: "Sent" del servidor y "Sent Items" de Outlook): la segunda va con su nombre.
    const repetida = tipo !== "otra" && vistos.has(tipo);
    vistos.add(tipo);
    if (repetida) tipo = "otra";
    // En muchos servidores todo cuelga de INBOX (INBOX.Sent, INBOX.Clientes): eso no cuenta como nivel.
    const padres = l.parent[0]?.toUpperCase() === "INBOX" ? l.parent.slice(1) : l.parent;
    return {
      path: l.path,
      nombre: tipo === "otra" ? l.name : NOMBRES_CARPETA[tipo],
      tipo,
      nivel: tipo === "otra" ? padres.length : 0,
      total: l.status?.messages ?? 0,
      noLeidos: l.status?.unseen ?? 0,
    };
  });
  return carpetas.sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo) || a.path.localeCompare(b.path, "es"));
}

/** La carpeta de ese tipo (Enviados, Papelera…), si la casilla la tiene. */
async function carpetaDe(imap: ImapFlow, tipo: Exclude<TipoCarpeta, "otra">): Promise<string | null> {
  const lista = (await imap.list()).filter(seleccionable);
  return lista.find((l) => tipoDe(l) === tipo)?.path ?? null;
}

/** Que la carpeta exista de verdad (lo que manda la página no se usa sin mirarlo). */
async function validarCarpeta(imap: ImapFlow, path: string) {
  const lista = await imap.list();
  if (!lista.some((l) => l.path === path && seleccionable(l))) throw new CorreoError("Esa carpeta no existe", "otro", 404);
}

export async function estadoCarpeta(imap: ImapFlow, carpeta: string): Promise<EstadoCarpeta> {
  const s = await imap.status(carpeta, { messages: true, unseen: true, uidNext: true });
  return { carpeta, total: s.messages ?? 0, noLeidos: s.unseen ?? 0, uidNext: s.uidNext ?? 0 };
}

/* ───────────── Lista de mails ───────────── */

const direcciones = (lista?: { name?: string; address?: string }[]): Direccion[] =>
  (lista ?? []).filter((a) => a.address).map((a) => ({ nombre: a.name?.trim() || null, email: a.address!.toLowerCase() }));

function tieneAdjuntos(nodo?: MessageStructureObject): boolean {
  if (!nodo) return false;
  if (nodo.childNodes?.length) return nodo.childNodes.some(tieneAdjuntos);
  if (nodo.type?.startsWith("multipart/")) return false;
  if (nodo.disposition === "attachment") return true;
  const nombre = nodo.dispositionParameters?.filename || nodo.parameters?.name;
  return Boolean(nombre) && nodo.disposition !== "inline" && !nodo.type?.startsWith("text/");
}

function resumen(m: FetchMessageObject): MensajeResumen {
  const flags = m.flags ?? new Set<string>();
  const fecha = m.envelope?.date ?? (m.internalDate ? new Date(m.internalDate) : new Date(0));
  return {
    uid: m.uid,
    asunto: m.envelope?.subject?.trim() || "",
    de: direcciones(m.envelope?.from),
    para: direcciones(m.envelope?.to),
    fecha: (isNaN(+fecha) ? new Date(0) : fecha).toISOString(),
    leido: flags.has("\\Seen"),
    destacado: flags.has("\\Flagged"),
    respondido: flags.has("\\Answered"),
    adjuntos: tieneAdjuntos(m.bodyStructure),
    tamano: m.size ?? 0,
  };
}

const CAMPOS = { uid: true, envelope: true, flags: true, bodyStructure: true, internalDate: true, size: true } as const;

export async function listarMensajes(imap: ImapFlow, carpeta: string, pagina: number, porPagina: number, q?: string): Promise<ListaMensajes> {
  const lock = await imap.getMailboxLock(carpeta, { readOnly: true });
  try {
    const box = imap.mailbox;
    const existen = box ? box.exists : 0;
    const mensajes: MensajeResumen[] = [];

    if (q) {
      const uids = ((await imap.search({ text: q }, { uid: true })) || []).sort((a, b) => b - a);
      const pag = uids.slice(pagina * porPagina, (pagina + 1) * porPagina);
      if (pag.length) for await (const m of imap.fetch(pag.join(","), CAMPOS, { uid: true })) mensajes.push(resumen(m));
      mensajes.sort((a, b) => b.uid - a.uid);
      return { carpeta, total: uids.length, pagina, porPagina, mensajes };
    }

    // Sin búsqueda, por posición: los últimos que llegaron primero.
    const fin = existen - pagina * porPagina;
    if (fin >= 1) {
      const inicio = Math.max(1, fin - porPagina + 1);
      const conSeq: { seq: number; m: MensajeResumen }[] = [];
      for await (const m of imap.fetch(`${inicio}:${fin}`, CAMPOS)) conSeq.push({ seq: m.seq, m: resumen(m) });
      conSeq.sort((a, b) => b.seq - a.seq).forEach((x) => mensajes.push(x.m));
    }
    return { carpeta, total: existen, pagina, porPagina, mensajes };
  } finally {
    lock.release();
  }
}

/* ───────────── Un mail ───────────── */

const addr = (a?: AddressObject | AddressObject[]): Direccion[] =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((o) => direcciones(o.value as { name?: string; address?: string }[]));

/** Más que esto de HTML no entra en la respuesta (Vercel corta en 4,5 MB): las imágenes van como links. */
const MAX_HTML = 3_000_000;

export type MailLeido = { fetch: FetchMessageObject; parsed: ParsedMail; source: Buffer };

/** El mail completo, ya interpretado. keepCid deja los "cid:" como están (para citarlo en una respuesta). */
export async function traerMail(imap: ImapFlow, carpeta: string, uid: number, opts: { marcar?: boolean; keepCid?: boolean } = {}): Promise<MailLeido> {
  const lock = await imap.getMailboxLock(carpeta, { readOnly: !opts.marcar });
  try {
    const m = await imap.fetchOne(String(uid), { uid: true, flags: true, envelope: true, internalDate: true, size: true, bodyStructure: true, source: true }, { uid: true });
    if (!m || !m.source) throw new CorreoError("Ese mail ya no está: lo movieron o lo borraron.", "otro", 404);
    if (opts.marcar && !m.flags?.has("\\Seen")) {
      await imap.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      m.flags?.add("\\Seen");
    }
    const parsed = await simpleParser(m.source, { keepCidLinks: opts.keepCid ?? false });
    return { fetch: m, parsed, source: m.source };
  } finally {
    lock.release();
  }
}

export function adjuntosDe(parsed: ParsedMail): Adjunto[] {
  return parsed.attachments.map((a, i) => ({
    indice: i,
    nombre: a.filename || `adjunto-${i + 1}`,
    tipo: a.contentType || "application/octet-stream",
    tamano: a.size ?? a.content?.length ?? 0,
    inline: Boolean(a.related && a.cid && a.contentType?.startsWith("image/")),
  }));
}

export async function leerMensaje(imap: ImapFlow, carpeta: string, uid: number): Promise<Mensaje> {
  let { fetch, parsed, source } = await traerMail(imap, carpeta, uid, { marcar: true });
  let html = typeof parsed.html === "string" ? parsed.html : null;

  // Imágenes pesadas dentro del texto: en vez de meterlas en la respuesta, se piden aparte.
  if (html && html.length > MAX_HTML) {
    parsed = await simpleParser(source, { keepCidLinks: true });
    html = typeof parsed.html === "string" ? parsed.html : null;
    if (html) {
      const porCid = new Map(parsed.attachments.map((a, i) => [a.cid ?? "", i]));
      html = html.replace(/cid:([^"'\s)>]+)/gi, (todo, cid: string) => {
        const i = porCid.get(cid);
        if (i === undefined) return todo;
        return `/api/correo/adjunto?carpeta=${encodeURIComponent(carpeta)}&uid=${uid}&i=${i}`;
      });
      if (html.length > MAX_HTML) html = null; // Ni así entra: queda el texto.
    }
  }

  const base = resumen(fetch);
  return {
    ...base,
    asunto: parsed.subject?.trim() || base.asunto,
    de: addr(parsed.from).length ? addr(parsed.from) : base.de,
    para: addr(parsed.to).length ? addr(parsed.to) : base.para,
    cc: addr(parsed.cc),
    responderA: addr(parsed.replyTo),
    messageId: parsed.messageId ?? null,
    html,
    texto: parsed.text?.slice(0, MAX_HTML) ?? null,
    listaAdjuntos: adjuntosDe(parsed),
  };
}

export async function adjunto(imap: ImapFlow, carpeta: string, uid: number, indice: number) {
  const { parsed } = await traerMail(imap, carpeta, uid, { keepCid: true });
  const a = parsed.attachments[indice];
  if (!a) throw new CorreoError("Ese adjunto no está", "otro", 404);
  return { nombre: a.filename || `adjunto-${indice + 1}`, tipo: a.contentType || "application/octet-stream", contenido: a.content };
}

/* ───────────── Acciones ───────────── */

async function crearArchivo(imap: ImapFlow): Promise<string> {
  const lista = await imap.list();
  const inbox = lista.find((l) => l.path.toUpperCase() === "INBOX");
  // Si las demás carpetas cuelgan de INBOX (INBOX.Sent), Archivo también.
  const bajoInbox = inbox && lista.some((l) => l.parent[0]?.toUpperCase() === "INBOX");
  const path = bajoInbox ? `${inbox.path}${inbox.delimiter}Archive` : "Archive";
  await imap.mailboxCreate(path);
  await imap.mailboxSubscribe(path).catch(() => false);
  return path;
}

export async function accionMensajes(imap: ImapFlow, carpeta: string, uids: number[], accion: AccionMensaje, destino?: string) {
  const rango = uids.join(",");
  let mover: string | null = null;
  let borrar = false;

  if (accion === "archivar") {
    mover = (await carpetaDe(imap, "archive")) ?? (await crearArchivo(imap));
  } else if (accion === "papelera") {
    const papelera = await carpetaDe(imap, "trash");
    // Ya en la Papelera (o sin Papelera): se borra de verdad.
    if (!papelera || papelera === carpeta) borrar = true;
    else mover = papelera;
  } else if (accion === "mover") {
    if (!destino) throw new CorreoError("Falta a qué carpeta moverlo", "otro", 400);
    await validarCarpeta(imap, destino);
    mover = destino;
  }

  const lock = await imap.getMailboxLock(carpeta);
  try {
    const op = { uid: true };
    if (accion === "leido") await imap.messageFlagsAdd(rango, ["\\Seen"], op);
    else if (accion === "no_leido") await imap.messageFlagsRemove(rango, ["\\Seen"], op);
    else if (accion === "destacar") await imap.messageFlagsAdd(rango, ["\\Flagged"], op);
    else if (accion === "quitar_destacado") await imap.messageFlagsRemove(rango, ["\\Flagged"], op);
    else if (borrar) await imap.messageDelete(rango, op);
    else if (mover && mover !== carpeta) await imap.messageMove(rango, mover, op);
  } finally {
    lock.release();
  }
}

export async function marcarFlag(imap: ImapFlow, carpeta: string, uid: number, flag: string) {
  const lock = await imap.getMailboxLock(carpeta);
  try {
    await imap.messageFlagsAdd(String(uid), [flag], { uid: true });
  } finally {
    lock.release();
  }
}

/** Deja una copia de lo enviado en Enviados (el SMTP no la guarda solo). false si la casilla no tiene Enviados. */
export async function guardarEnviado(imap: ImapFlow, raw: Buffer) {
  const enviados = await carpetaDe(imap, "sent");
  if (!enviados) return false;
  await imap.append(enviados, raw, ["\\Seen"]);
  return true;
}
