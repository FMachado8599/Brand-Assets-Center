import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/integraciones/crypto";
import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase-server";
import { esDelDominio } from "./config";
import { CorreoError, type CuentaCorreo } from "./imap.server";

/**
 * Lo que comparten las rutas de /api/correo: quién hace el pedido, su casilla (con la contraseña
 * descifrada, que nunca sale del servidor) y cómo se contestan los errores.
 */

const SIN_CACHE = { "Cache-Control": "no-store" };

export const responder = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: SIN_CACHE });

export type Usuario = { id: string; email: string; nombre: string | null };

export async function usuarioDelPedido(): Promise<{ db: SupabaseClient; usuario: Usuario }> {
  // Sin Supabase (un preview sin las variables) se contesta 503 «falta configurar», como el resto de la API.
  if (!hasSupabaseEnv) throw new CorreoError("Falta configurar Supabase en este entorno", "sin_migracion", 503);
  const db = createSupabaseServer();
  const { data } = await db.auth.getClaims();
  const c = data?.claims;
  const email = typeof c?.email === "string" ? c.email.toLowerCase() : null;
  if (!c?.sub || !email) throw new CorreoError("Iniciá sesión para ver tu correo", "otro", 401);
  const meta = (c.user_metadata ?? {}) as Record<string, unknown>;
  const nombre = [meta.full_name, meta.name].find((v): v is string => typeof v === "string" && v.trim() !== "")?.trim() ?? null;
  return { db, usuario: { id: c.sub, email, nombre } };
}

const sinMigracion = (m: string) => /correo_cuentas|schema cache|does not exist/i.test(m);

function errorDeBase(message: string) {
  return sinMigracion(message)
    ? new CorreoError("Falta correr supabase/migracion-correo.sql en Supabase", "sin_migracion", 503)
    : new CorreoError(message, "otro", 500);
}

/** La casilla guardada de quien hace el pedido. null si todavía no la conectó. */
export async function leerCuenta(db: SupabaseClient, usuario: Usuario): Promise<CuentaCorreo | null> {
  const { data, error } = await db.from("correo_cuentas").select("email, password").eq("user_id", usuario.id).maybeSingle<{ email: string; password: string }>();
  if (error) throw errorDeBase(error.message);
  if (!data) return null;
  // Si cambió el mail con el que entra (otra cuenta de Google), la casilla vieja no sirve.
  if (data.email !== usuario.email) return null;
  try {
    return { email: data.email, password: decrypt(data.password) };
  } catch {
    // Se cifró con otra INTEGRACIONES_SECRET (ej: se conectó desde otro entorno): hay que volver a poner la contraseña.
    return null;
  }
}

export async function guardarCuenta(db: SupabaseClient, usuario: Usuario, password: string) {
  const { error } = await db.from("correo_cuentas").upsert({
    user_id: usuario.id,
    email: usuario.email,
    password: encrypt(password),
    conectada: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw errorDeBase(error.message);
}

export async function borrarCuenta(db: SupabaseClient, usuario: Usuario) {
  const { error } = await db.from("correo_cuentas").delete().eq("user_id", usuario.id);
  if (error) throw errorDeBase(error.message);
}

/** Para las rutas que usan la casilla: sin casilla conectada contestan "sin_cuenta" y la página pide la contraseña. */
export async function conCuenta(): Promise<{ db: SupabaseClient; usuario: Usuario; cuenta: CuentaCorreo & { nombre: string | null } }> {
  const { db, usuario } = await usuarioDelPedido();
  if (!esDelDominio(usuario.email)) throw new CorreoError("Tu cuenta no tiene casilla de correo del estudio", "sin_cuenta", 403);
  const cuenta = await leerCuenta(db, usuario);
  if (!cuenta) throw new CorreoError("Conectá tu casilla para ver tu correo", "sin_cuenta", 409);
  return { db, usuario, cuenta: { ...cuenta, nombre: usuario.nombre } };
}

export function responderError(e: unknown) {
  const err = e instanceof CorreoError ? e : new CorreoError((e as Error)?.message || "Algo falló", "otro", 500);
  if (err.status >= 500 && err.codigo === "otro") console.error("[correo]", e);
  return responder({ error: err.message, codigo: err.codigo }, err.status);
}

/** Los pedidos que cambian algo tienen que venir de la misma app (frena el CSRF). */
export function mismoOrigen(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const otroOrigen = () => responder({ error: "Pedido de otro sitio", codigo: "otro" }, 403);

/** La carpeta y el uid de la URL, con lo mínimo validado. */
export function carpetaYUid(url: URL) {
  const carpeta = url.searchParams.get("carpeta") || "INBOX";
  const uid = Number(url.searchParams.get("uid"));
  if (carpeta.length > 300) throw new CorreoError("Carpeta inválida", "otro", 400);
  return { carpeta, uid: Number.isInteger(uid) && uid > 0 ? uid : null };
}
