import "server-only";
import { createHash, createHmac, randomBytes, randomInt } from "crypto";
import { cookies } from "next/headers";
import nodemailer from "nodemailer";
import { CORREO } from "@/lib/correo/config";
import { decrypt } from "@/lib/integraciones/crypto";
import { MESES } from "./config";

/**
 * La entrada del cliente a una presentación compartida (supabase/migracion-presentaciones-acceso.sql):
 * pone su mail, le llega un código desde la casilla de quien la compartió y, con el código, ese
 * navegador queda habilitado 30 días con una cookie que solo lee el servidor.
 */

/** Cuánto dura la entrada en ese navegador (igual que en la base). */
export const DIAS_ENTRADA = 30;

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Una cookie por presentación (por su link): cambiar el link deja la vieja sin efecto. */
export const nombreCookie = (token: string) => `pacc_${sha(token).slice(0, 16)}`;

export const VALID_TOKEN = /^[A-Za-z0-9_-]{32,200}$/;

function secreto() {
  const s = process.env.INTEGRACIONES_SECRET;
  if (!s || s.length < 32) throw new Error("Falta INTEGRACIONES_SECRET en las variables del servidor");
  return s;
}

/** El código de 6 números, al azar de verdad. */
export const nuevoCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Lo que se guarda del código: un HMAC con la clave del servidor (la base nunca ve el código). */
export const hashCodigo = (token: string, email: string, codigo: string) =>
  createHmac("sha256", secreto()).update(`codigo-v1:${token}:${email.toLowerCase()}:${codigo}`).digest("hex");

/** La llave de la entrada (va en la cookie) y su hash (va en la base). */
export function nuevaEntrada() {
  const sesion = randomBytes(32).toString("base64url");
  return { sesion, hash: sha(sesion) };
}

export function leerEntrada(token: string) {
  return cookies().get(nombreCookie(token))?.value ?? "";
}

export function guardarEntrada(token: string, sesion: string) {
  cookies().set(nombreCookie(token), sesion, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DIAS_ENTRADA * 86_400,
  });
}

export function borrarEntrada(token: string) {
  cookies().delete(nombreCookie(token));
}

/** Lo que devuelve presentacion_pedir_codigo cuando el mail está habilitado. */
export type PedidoOk = {
  estado: "ok";
  remitente: { email: string; password: string; nombre: string | null };
  cliente: string;
  titulo: string;
  tipo: string | null;
  mes: number;
  anio: number;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Manda el código desde la casilla de quien compartió la presentación (sin guardar copia en sus Enviados). */
export async function mandarCodigo(pedido: PedidoOk, para: string, codigo: string) {
  const { remitente } = pedido;
  const que = `${pedido.tipo ?? "la presentación"} ${MESES[pedido.mes - 1] ?? ""} ${pedido.anio}`.trim();
  const asunto = `${codigo} es tu código para ver ${que} de ${pedido.cliente}`;
  const texto =
    `Hola,\n\nTu código para entrar a ${que} de ${pedido.cliente} es:\n\n${codigo}\n\n` +
    `Vence en 10 minutos. Si no lo pediste vos, ignorá este mail.\n\n` +
    `${remitente.nombre ?? ""}\nCámara TBWA`;
  const html =
    `<div style="font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b0b0e;max-width:480px">` +
    `<p>Hola,</p><p>Tu código para entrar a <b>${esc(que)}</b> de <b>${esc(pedido.cliente)}</b> es:</p>` +
    `<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${codigo}</p>` +
    `<p style="color:#625f58;font-size:13px">Vence en 10 minutos. Si no lo pediste vos, ignorá este mail.</p>` +
    `<p>${esc(remitente.nombre ?? "")}<br>Cámara TBWA</p></div>`;

  const smtp = nodemailer.createTransport({
    host: CORREO.smtp.host,
    port: CORREO.smtp.port,
    secure: CORREO.smtp.port === 465,
    auth: { user: remitente.email, pass: decrypt(remitente.password) },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  try {
    await smtp.sendMail({
      from: remitente.nombre ? { name: `${remitente.nombre} · Cámara TBWA`, address: remitente.email } : remitente.email,
      to: para,
      subject: asunto,
      text: texto,
      html,
    });
  } finally {
    smtp.close();
  }
}
