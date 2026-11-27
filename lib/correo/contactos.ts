"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { recortarFoto } from "@/lib/perfil";
import type { LogoBg } from "@/lib/types";

/**
 * Quién es cada mail del Correo (supabase/migracion-correo-contactos.sql): la foto (la del perfil de
 * la app, si no la asignada a mano, si no la de Basecamp), el nombre, el cargo y de qué cliente es.
 * Se pregunta de a muchos (una página de la bandeja de una vez) y se recuerda mientras la página está
 * abierta: el mismo mail no se vuelve a pedir.
 */

export type ClienteDeMail = { id: string; name: string; color: string; logo_url: string | null; logo_bg: LogoBg; logo_from: string | null };

export type Contacto = {
  email: string;
  foto: string | null;
  /** De dónde sale la foto: su perfil en la app, una asignada a mano o la de Basecamp. */
  fotoOrigen: "perfil" | "asignada" | "basecamp" | null;
  nombre: string | null;
  cargo: string | null;
  clientes: ClienteDeMail[];
};

/** null: se preguntó y no hay nada de ese mail. undefined: todavía no se sabe. */
const cache = new Map<string, Contacto | null>();
const pedidos = new Set<string>();
const oyentes = new Set<() => void>();
let version = 0;
let sinMigracion = false;

const avisar = () => {
  version++;
  oyentes.forEach((f) => f());
};

const normal = (email: string) => email.trim().toLowerCase();

type Fila = { email: string; foto: string | null; foto_origen: string | null; nombre: string | null; cargo: string | null; clientes: unknown };

function deFila(f: Fila): Contacto {
  const clientes = Array.isArray(f.clientes)
    ? (f.clientes as Record<string, unknown>[]).flatMap((c): ClienteDeMail[] =>
        typeof c?.id === "string" && typeof c?.name === "string"
          ? [{
              id: c.id,
              name: c.name,
              color: typeof c.color === "string" ? c.color : "#888888",
              logo_url: typeof c.logo_url === "string" ? c.logo_url : null,
              logo_bg: c.logo_bg === "dark" || c.logo_bg === "brand" ? c.logo_bg : "light",
              logo_from: typeof c.logo_from === "string" ? c.logo_from : null,
            }]
          : []
      )
    : [];
  const origen = f.foto_origen === "perfil" || f.foto_origen === "asignada" || f.foto_origen === "basecamp" ? f.foto_origen : null;
  return { email: f.email, foto: f.foto?.startsWith("https://") ? f.foto : null, fotoOrigen: origen, nombre: f.nombre, cargo: f.cargo, clientes };
}

let tanda: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Junta lo que piden varios componentes en el mismo momento y lo pregunta de una vez. */
function pedir(emails: string[]) {
  if (sinMigracion) return;
  for (const e of emails) {
    const m = normal(e);
    if (!m.includes("@") || cache.has(m) || pedidos.has(m)) continue;
    pedidos.add(m);
    tanda.push(m);
  }
  if (!tanda.length || timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const lote = tanda.splice(0, tanda.length);
    for (let i = 0; i < lote.length; i += 300) await traer(lote.slice(i, i + 300));
  }, 30);
}

async function traer(lote: string[]) {
  const { data, error } = await supabase.rpc("correo_contactos", { p_emails: lote });
  lote.forEach((e) => pedidos.delete(e));
  if (error) {
    // Sin la migración no hay fotos ni clientes: cada mail queda con su inicial, sin volver a preguntar.
    if (/correo_contactos|schema cache|does not exist|42883/i.test(error.message)) sinMigracion = true;
    else console.warn("[correo] contactos:", error.message);
    lote.forEach((e) => cache.set(e, null));
    avisar();
    return;
  }
  const vistos = new Set<string>();
  for (const f of (data ?? []) as Fila[]) {
    const c = deFila(f);
    cache.set(c.email, c);
    vistos.add(c.email);
  }
  lote.forEach((e) => !vistos.has(e) && cache.set(e, null));
  avisar();
}

const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

/** Lo que se sabe de esos mails. Los que faltan se piden solos; el mapa se actualiza cuando llegan. */
export function useContactos(emails: string[]): Map<string, Contacto> {
  const v = useSyncExternalStore(suscribir, () => version, () => 0);
  const clave = emails.map(normal).sort().join(",");
  useEffect(() => {
    if (clave) pedir(clave.split(","));
  }, [clave]);
  return useMemo(() => {
    const m = new Map<string, Contacto>();
    for (const e of clave ? clave.split(",") : []) {
      const c = cache.get(e);
      if (c) m.set(e, c);
    }
    return m;
    // v: cada vez que llega algo nuevo se arma el mapa de nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, v]);
}

/** Uno solo. */
export function useContacto(email: string | null | undefined): Contacto | null {
  const m = useContactos(email ? [email] : []);
  return email ? m.get(normal(email)) ?? null : null;
}

/** Vuelve a preguntar por esos mails (después de cambiar una foto o un cliente). */
export function olvidarContactos(emails?: string[]) {
  if (emails) emails.forEach((e) => cache.delete(normal(e)));
  else cache.clear();
  sinMigracion = false;
  avisar();
}

/* ───────────── Fotos asignadas a mano ───────────── */

export const BUCKET_AVATARES_CORREO = "correo-avatares";
/** El lado del cuadrado que se sube: más chico que esto no se ve bien, más grande no hace falta. */
export const LADO_AVATAR = 150;

const enRuta = (email: string) => normal(email).replace(/[^a-z0-9._-]+/g, "_").slice(0, 120);

function mensajeDeError(message: string) {
  if (/correo_avatares|bucket not found|schema cache|does not exist/i.test(message)) return "Falta correr supabase/migracion-correo-contactos.sql en Supabase.";
  if (/row-level security|permission denied|unauthorized/i.test(message)) return "No tenés permiso para cambiar fotos.";
  if (/payload too large|exceeded the maximum/i.test(message)) return "La foto pesa demasiado.";
  return message;
}

/** Le pone una foto a un mail: la recorta a un cuadrado de 150 px, la sube y reemplaza la que tenía. */
export async function asignarFoto(email: string, archivo: File) {
  const mail = normal(email);
  const blob = await recortarFoto(archivo, LADO_AVATAR);
  const path = `${enRuta(mail)}-${Date.now()}.jpg`;
  const { data: antes } = await supabase.from("correo_avatares").select("foto_path").eq("email", mail).maybeSingle<{ foto_path: string }>();
  const subida = await supabase.storage.from(BUCKET_AVATARES_CORREO).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (subida.error) throw new Error(mensajeDeError(subida.error.message));
  const url = supabase.storage.from(BUCKET_AVATARES_CORREO).getPublicUrl(path).data.publicUrl;
  const { error } = await supabase
    .from("correo_avatares")
    .upsert({ email: mail, foto_path: path, foto_url: url, updated_at: new Date().toISOString() });
  if (error) {
    await supabase.storage.from(BUCKET_AVATARES_CORREO).remove([path]);
    throw new Error(mensajeDeError(error.message));
  }
  if (antes?.foto_path && antes.foto_path !== path) await supabase.storage.from(BUCKET_AVATARES_CORREO).remove([antes.foto_path]);
  olvidarContactos([mail]);
}

/** Le saca la foto asignada (vuelve a la de Basecamp, si tiene, o a la inicial). */
export async function quitarFoto(email: string) {
  const mail = normal(email);
  const { data: antes, error: e1 } = await supabase.from("correo_avatares").select("foto_path").eq("email", mail).maybeSingle<{ foto_path: string }>();
  if (e1) throw new Error(mensajeDeError(e1.message));
  const { error } = await supabase.from("correo_avatares").delete().eq("email", mail);
  if (error) throw new Error(mensajeDeError(error.message));
  if (antes?.foto_path) await supabase.storage.from(BUCKET_AVATARES_CORREO).remove([antes.foto_path]);
  olvidarContactos([mail]);
}
