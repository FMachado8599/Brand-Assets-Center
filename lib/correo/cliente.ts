"use client";

import DOMPurify from "dompurify";
import type { CodigoError, Direccion, Mensaje, ModoEnvio } from "./types";

/** Lo que la página necesita del Correo: pedirle cosas al servidor, armar respuestas y mostrar un mail sin riesgo. */

export class ErrorCorreo extends Error {
  constructor(
    message: string,
    public codigo: CodigoError
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new ErrorCorreo("No hay conexión con la app. Revisá internet y probá de nuevo.", "otro");
  }
  const j = (await r.json().catch(() => ({}))) as { error?: string; codigo?: CodigoError };
  if (!r.ok) {
    const fallback = r.status === 413 ? "El mail es demasiado pesado (hasta 4 MB de adjuntos)" : `Algo falló (${r.status})`;
    throw new ErrorCorreo(j.error ?? fallback, j.codigo ?? "otro");
  }
  return j as T;
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/* ───────────── Responder y reenviar ───────────── */

/** "a@x.com, Juan <b@y.com>; c@z.com" → ["a@x.com", "b@y.com", "c@z.com"]. */
export function separarMails(texto: string): string[] {
  return texto
    .split(/[,;\n]+/)
    .map((p) => {
      const m = p.match(/<([^>]+)>/);
      return (m ? m[1] : p).trim().toLowerCase();
    })
    .filter(Boolean);
}

const unir = (lista: Direccion[]) => lista.map((d) => d.email).join(", ");

function conPrefijo(asunto: string, prefijo: "RE" | "RV") {
  const limpio = asunto.trim();
  const ya = prefijo === "RE" ? /^(re|rv)\s*:/i : /^(rv|fw|fwd|reenv)\s*:/i;
  return ya.test(limpio) ? limpio : `${prefijo}: ${limpio}`;
}

export type Borrador = {
  modo: ModoEnvio;
  para: string;
  cc: string;
  asunto: string;
  original?: { carpeta: string; uid: number; mensaje: Mensaje };
};

/** Cómo arranca el mail nuevo al responder, responder a todos o reenviar. */
export function borradorDe(modo: ModoEnvio, yo: string, carpeta?: string, m?: Mensaje | null): Borrador {
  if (modo === "nuevo" || !m || !carpeta) return { modo: "nuevo", para: "", cc: "", asunto: "" };
  const original = { carpeta, uid: m.uid, mensaje: m };
  if (modo === "reenviar") return { modo, para: "", cc: "", asunto: conPrefijo(m.asunto, "RV"), original };

  const yoMismo = (d: Direccion) => d.email === yo.toLowerCase();
  // Si el mail es mío (está en Enviados), responder es seguir escribiéndole a los mismos.
  const mio = m.de.some(yoMismo);
  const destino = mio ? m.para : m.responderA.length ? m.responderA : m.de;
  if (modo === "responder") return { modo, para: unir(destino), cc: "", asunto: conPrefijo(m.asunto, "RE"), original };

  const vistos = new Set(destino.map((d) => d.email));
  const resto = [...(mio ? [] : m.para), ...m.cc].filter((d) => !yoMismo(d) && !vistos.has(d.email) && (vistos.add(d.email), true));
  return { modo, para: unir(destino), cc: unir(resto), asunto: conPrefijo(m.asunto, "RE"), original };
}

/* ───────────── Mostrar un mail ───────────── */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Texto plano a HTML, con los links clickeables. */
export function textoAHtml(texto: string) {
  return `<div style="white-space:pre-wrap">${esc(texto).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</div>`;
}

const PROHIBIDOS = ["script", "iframe", "frame", "frameset", "object", "embed", "form", "input", "button", "textarea", "select", "meta", "link", "base", "svg", "math"];

/** Si el mail trae imágenes o estilos de afuera (que pueden avisarle al que lo mandó que lo abriste). */
const REMOTO = /(src|background)\s*=\s*["']?\s*(https?:)?\/\/|url\(\s*["']?\s*(https?:)?\/\//i;

/**
 * El mail listo para un iframe aislado: sin scripts ni formularios (DOMPurify), y con una política de
 * seguridad que no deja cargar nada de afuera hasta que la persona lo pide (las imágenes remotas sirven
 * para saber si abriste el mail). Los links abren en otra pestaña.
 */
export function documentoMail(html: string | null, texto: string | null, imagenes: boolean) {
  const fuente = html ?? textoAHtml(texto ?? "");
  const raiz = DOMPurify.sanitize(fuente, {
    WHOLE_DOCUMENT: true,
    RETURN_DOM: true,
    FORBID_TAGS: PROHIBIDOS,
    FORBID_ATTR: ["srcset", "ping", "formaction", "action"],
    ADD_ATTR: ["target"],
  }) as HTMLElement;
  raiz.querySelectorAll("a[href]").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });
  const estilos = Array.from(raiz.querySelectorAll("style"))
    .map((s) => s.outerHTML)
    .join("");
  raiz.querySelectorAll("style").forEach((s) => s.remove());
  const cuerpo = (raiz.querySelector("body") ?? raiz).innerHTML;
  const remotas = REMOTO.test(cuerpo) || REMOTO.test(estilos);

  const origen = typeof window === "undefined" ? "" : window.location.origin;
  const afuera = imagenes ? " https: http:" : "";
  const csp = `default-src 'none'; img-src data: ${origen}${afuera}; style-src 'unsafe-inline'${afuera}; font-src data:${afuera}`;
  const doc =
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<base target="_blank"><style>` +
    `html,body{margin:0;background:#fff}body{padding:20px 24px;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1c1b19;overflow-wrap:anywhere}` +
    `img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{color:#1a5fb4}` +
    `blockquote{margin:0 0 0 .8ex;border-left:2px solid #d6d1c4;padding-left:1ex;color:#55524a}` +
    `</style>${estilos}</head><body>${cuerpo}</body></html>`;
  return { doc, remotas };
}

/* ───────────── Fechas ───────────── */

const hoy = (d: Date) => d.toDateString() === new Date().toDateString();

/** En la lista: la hora si es de hoy, el día si es de este año, la fecha completa si no. */
export function fechaCorta(iso: string) {
  const d = new Date(iso);
  if (hoy(d)) return d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
  if (d.getFullYear() === new Date().getFullYear()) return d.toLocaleDateString("es-UY", { day: "numeric", month: "short" });
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
