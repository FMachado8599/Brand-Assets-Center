import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { STUDIO } from "@/lib/site";
import { createSupabaseServer } from "@/lib/supabase-server";
import { hashDeToken, hayPepper, huella, nuevoToken, PEPPER_VERSION } from "./contrasena.server";

/**
 * Lo que necesitan las rutas de /api/auth/contrasena: la clave de servicio de Supabase (para las tablas
 * de contraseñas, que la app no puede leer, y para crear la sesión), los límites de intentos, los links
 * de un solo uso y el mail. Solo corre en el servidor: la clave de servicio nunca llega al navegador.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Está todo para entrar con contraseña: Supabase, su clave de servicio y el pepper. */
export const ingresoConContrasenaListo = () => Boolean(url && anon && servicio && hayPepper());

let admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient {
  if (!servicio) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  return (admin ??= createClient(url, servicio, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
}

/* ───────────── HTTP ───────────── */

const SIN_CACHE = { "Cache-Control": "no-store" };

export const responder = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: SIN_CACHE });

export const noConfigurado = () =>
  responder({ error: "El ingreso con contraseña todavía no está configurado en este entorno." }, 503);

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

export function origenDe(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export const ipDe = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";

/** El cuerpo en JSON, con tope de tamaño. null si no es un objeto. */
export async function leerJson(req: Request, max = 4096): Promise<Record<string, unknown> | null> {
  const texto = await req.text();
  if (texto.length > max) return null;
  try {
    const v = JSON.parse(texto);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function mailValido(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().toLowerCase();
  return m.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m) ? m : null;
}

/** Solo vuelve a una ruta de la app ("/board"), nunca a otro sitio. */
export const destinoSeguro = (v: unknown) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/");

/* ───────────── Fuerza bruta ─────────────
   Cada intento queda anotado con una huella (HMAC) del mail o de la IP. Si en la ventana hay demasiados,
   se frena con un 429 y un mensaje genérico. Una entrada bien hecha limpia los fallos de esa cuenta. */

export type Limite = { clave: string; max: number; minutos: number; contar?: "fallos" | "todos" };

export const limiteCuenta = (email: string): Limite => ({ clave: `cuenta:${huella(email)}`, max: 5, minutos: 15 });
export const limiteIp = (ip: string): Limite => ({ clave: `ip:${huella(ip)}`, max: 20, minutos: 15 });

export async function frenado(limites: Limite[]) {
  const db = supabaseAdmin();
  for (const l of limites) {
    let q = db
      .from("credencial_intentos")
      .select("id", { count: "exact", head: true })
      .eq("clave", l.clave)
      .gt("creado", new Date(Date.now() - l.minutos * 60_000).toISOString());
    if ((l.contar ?? "fallos") === "fallos") q = q.eq("exito", false);
    const { count, error } = await q;
    // Si no se puede contar, se frena: mejor un "probá en un rato" que dejar la puerta abierta.
    if (error || (count ?? 0) >= l.max) return true;
  }
  return false;
}

export async function anotar(limites: Limite[], exito: boolean) {
  const db = supabaseAdmin();
  await db.from("credencial_intentos").insert(limites.map((l) => ({ clave: l.clave, exito })));
  if (exito) {
    // Bien hecho: los fallos de esa cuenta ya no cuentan (los de la IP sí, por si prueba otras cuentas).
    const cuentas = limites.filter((l) => l.clave.startsWith("cuenta:")).map((l) => l.clave);
    if (cuentas.length) await db.from("credencial_intentos").delete().in("clave", cuentas).eq("exito", false);
  }
  // De vez en cuando se borra lo viejo (más de un día): la tabla no crece para siempre.
  if (Math.random() < 0.03) {
    await db.from("credencial_intentos").delete().lt("creado", new Date(Date.now() - 86_400_000).toISOString());
  }
}

export const DEMASIADOS = "Demasiados intentos. Esperá unos minutos y probá de nuevo.";

/* ───────────── Cuentas ───────────── */

export async function mailPermitido(email: string) {
  const { data, error } = await supabaseAdmin().rpc("email_allowed", { addr: email });
  return !error && data === true;
}

/** Su cuenta (por el mail del perfil, que se copia solo del de la sesión y no se puede editar). */
export async function usuarioPorMail(email: string): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin().from("profiles").select("id").eq("email", email).limit(1).maybeSingle();
  return data ? { id: String(data.id) } : null;
}

export async function credencialDe(userId: string): Promise<{ hash: string; pepper_version: number } | null> {
  const { data } = await supabaseAdmin().from("credenciales").select("hash, pepper_version").eq("user_id", userId).maybeSingle();
  return data ? { hash: String(data.hash), pepper_version: Number(data.pepper_version) } : null;
}

export async function guardarCredencial(userId: string, hash: string) {
  const { error } = await supabaseAdmin()
    .from("credenciales")
    .upsert({ user_id: userId, hash, pepper_version: PEPPER_VERSION, updated_at: new Date().toISOString() });
  if (error) throw new Error("No se pudo guardar la contraseña");
}

/** La cuenta de ese mail; si todavía no tiene (nunca entró), se crea, confirmada y sin contraseña de Supabase. */
export async function asegurarUsuario(email: string, nombre: string | null): Promise<string> {
  const ya = await usuarioPorMail(email);
  if (ya) return ya.id;
  const meta = nombre ? { full_name: nombre, name: nombre } : {};
  const { data, error } = await supabaseAdmin().auth.admin.createUser({ email, email_confirm: true, user_metadata: meta });
  if (error || !data.user) throw new Error(/registered|exists/i.test(error?.message ?? "") ? "Esa cuenta ya existe" : "No se pudo crear la cuenta");
  return data.user.id;
}

/**
 * Deja la sesión de Supabase iniciada para ese mail (las cookies van en la respuesta). Supabase no sabe
 * de nuestras contraseñas: se pide un link mágico como admin (no se manda ningún mail) y se canjea acá.
 */
export async function iniciarSesion(email: string) {
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) throw new Error("No se pudo iniciar la sesión");
  const supabase = createSupabaseServer();
  const primero = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (!primero.error) return;
  const segundo = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (segundo.error) throw new Error("No se pudo iniciar la sesión");
}

/* ───────────── Links de un solo uso ───────────── */

export type Motivo = "invitacion" | "recuperar";

export const HORAS_LINK: Record<Motivo, number> = { invitacion: 72, recuperar: 1 };

/** `horas`: lo que dura (por defecto, según el motivo; los que genera un admin duran lo de una invitación). */
export async function crearLink(email: string, motivo: Motivo, creadoPor: string | null, horas = HORAS_LINK[motivo]) {
  const { token, tokenHash } = nuevoToken();
  const { error } = await supabaseAdmin()
    .from("credencial_tokens")
    .insert({ token_hash: tokenHash, email, motivo, creado_por: creadoPor, expira: new Date(Date.now() + horas * 3_600_000).toISOString() });
  if (error) throw new Error("No se pudo crear el link");
  return token;
}

/** El link, si sirve (no se usó y no venció). */
export async function leerLink(token: unknown): Promise<{ id: string; email: string; motivo: Motivo } | null> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  const { data } = await supabaseAdmin()
    .from("credencial_tokens")
    .select("id, email, motivo")
    .eq("token_hash", hashDeToken(token))
    .is("usado", null)
    .gt("expira", new Date().toISOString())
    .maybeSingle();
  return data ? { id: String(data.id), email: String(data.email), motivo: data.motivo as Motivo } : null;
}

/** Lo marca usado. false si otro pedido lo usó justo antes (un link sirve una sola vez). */
export async function usarLink(id: string) {
  const { data } = await supabaseAdmin()
    .from("credencial_tokens")
    .update({ usado: new Date().toISOString() })
    .eq("id", id)
    .is("usado", null)
    .select("id");
  return Boolean(data?.length);
}

/** Al poner una contraseña nueva, los otros links de ese mail dejan de servir. */
export async function anularLinks(email: string) {
  await supabaseAdmin().from("credencial_tokens").update({ usado: new Date().toISOString() }).eq("email", email).is("usado", null);
}

/* ───────────── Mail ───────────── */

/** Con Resend y un remitente de un dominio verificado. Sin eso, el link lo copia un admin. */
export const hayMail = () => Boolean(process.env.RESEND_API_KEY && process.env.AUTH_MAIL_FROM);

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function mandarLink(email: string, link: string, motivo: Motivo, horas = HORAS_LINK[motivo]) {
  if (!hayMail()) return false;
  const vale = horas === 1 ? "1 hora" : `${horas} horas`;
  const titulo = motivo === "invitacion" ? "Creá tu contraseña" : "Cambiá tu contraseña";
  const texto =
    motivo === "invitacion"
      ? `Te sumaron a Herramientas de ${STUDIO}. Para entrar con tu mail, creá tu contraseña (el link vale ${vale} y sirve una sola vez).`
      : `Para cambiar tu contraseña de Herramientas, usá este link (vale ${vale} y sirve una sola vez). Si no lo pediste, ignorá este mail.`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.AUTH_MAIL_FROM,
        to: [email],
        subject: `${titulo} · Herramientas`,
        text: `${texto}\n\n${link}`,
        html: `<p>${escapar(texto)}</p><p><a href="${escapar(link)}">${escapar(titulo)}</a></p>`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
