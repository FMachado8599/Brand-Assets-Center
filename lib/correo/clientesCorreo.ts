"use client";

import { supabase } from "@/lib/supabase";
import { olvidarContactos } from "./contactos";

/**
 * Los mails y dominios de cada cliente (supabase/migracion-correo-contactos.sql), vistos desde la ficha.
 * "ana@cliente.com" es esa persona; "cliente.com", todos los de ahí. Con esto el Correo sabe de qué
 * cliente es cada mail.
 */

export type CorreoDeCliente = { id: string; brand_id: string; valor: string; nombre: string; created_at: string };

/** Los dominios de todo el mundo (y el del estudio): de ahí solo se cargan mails sueltos. Igual que en la base. */
const GENERICOS = new Set([
  "camaratbwa.com", "gmail.com", "googlemail.com", "hotmail.com", "hotmail.es", "outlook.com", "outlook.es",
  "live.com", "msn.com", "yahoo.com", "yahoo.es", "yahoo.com.ar", "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "adinet.com.uy", "montevideo.com.uy", "vera.com.uy", "netgate.com.uy",
]);

const DOMINIO = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const MAIL = /^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * Lo que escribió la persona, listo para guardar: "Ana <ana@Cliente.com>" → "ana@cliente.com";
 * "@cliente.com" o "www.cliente.com" → "cliente.com". Si no sirve, dice por qué.
 */
export function normalizarValor(entrada: string): { valor: string; tipo: "mail" | "dominio" } | { error: string } {
  let v = entrada.trim().toLowerCase();
  const entre = v.match(/<([^>]+)>/);
  if (entre) v = entre[1].trim();
  v = v.replace(/^mailto:/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!v) return { error: "Escribí un mail o un dominio" };
  if (v.includes("@") && !v.startsWith("@")) {
    if (!MAIL.test(v)) return { error: "Ese mail no parece válido" };
    return { valor: v, tipo: "mail" };
  }
  v = v.replace(/^@/, "").replace(/^www\./, "");
  if (!DOMINIO.test(v)) return { error: "Ese dominio no parece válido (ej: cliente.com.uy)" };
  if (GENERICOS.has(v)) return { error: `${v} es de todo el mundo: cargá el mail entero de la persona` };
  return { valor: v, tipo: "dominio" };
}

export const esDominio = (valor: string) => !valor.includes("@");

function mensaje(message: string) {
  if (/cliente_correos|schema cache|does not exist/i.test(message)) return "Falta correr supabase/migracion-correo-contactos.sql en Supabase.";
  if (/cliente_correos_unico_idx|duplicate key/i.test(message)) return "Ya está cargado en este cliente.";
  if (/cliente_correos_valor_valido/i.test(message)) return "Ese mail o dominio no sirve.";
  if (/row-level security|permission denied/i.test(message)) return "No tenés permiso para cambiar esto.";
  return message;
}

export const faltaMigracionCorreos = (message: string) => /migracion-correo-contactos/.test(message);

export const correosCliente = {
  async listar(brandId: string): Promise<CorreoDeCliente[]> {
    const { data, error } = await supabase
      .from("cliente_correos")
      .select("id, brand_id, valor, nombre, created_at")
      .eq("brand_id", brandId)
      .order("created_at");
    if (error) throw new Error(mensaje(error.message));
    return (data ?? []) as CorreoDeCliente[];
  },

  async agregar(brandId: string, valor: string, nombre: string): Promise<CorreoDeCliente> {
    const { data, error } = await supabase
      .from("cliente_correos")
      .insert({ brand_id: brandId, valor, nombre: nombre.trim().slice(0, 120) })
      .select("id, brand_id, valor, nombre, created_at")
      .single();
    if (error) throw new Error(mensaje(error.message));
    olvidarContactos();
    return data as CorreoDeCliente;
  },

  async editar(id: string, patch: { valor?: string; nombre?: string }): Promise<CorreoDeCliente> {
    const { data, error } = await supabase
      .from("cliente_correos")
      .update({ ...patch, ...(patch.nombre != null ? { nombre: patch.nombre.trim().slice(0, 120) } : {}), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, brand_id, valor, nombre, created_at")
      .single();
    if (error) throw new Error(mensaje(error.message));
    olvidarContactos();
    return data as CorreoDeCliente;
  },

  async borrar(id: string) {
    const { error } = await supabase.from("cliente_correos").delete().eq("id", id);
    if (error) throw new Error(mensaje(error.message));
    olvidarContactos();
  },

  /** Los clientes que tienen al menos un mail o dominio cargado (para el filtro de la bandeja). */
  async clientesConCorreo(): Promise<{ id: string; name: string; color: string; logo_url: string | null; logo_bg: "light" | "dark" | "brand"; logo_from: string | null }[]> {
    const { data, error } = await supabase.from("cliente_correos").select("brand_id");
    if (error) throw new Error(mensaje(error.message));
    const ids = [...new Set((data ?? []).map((r: { brand_id: string }) => r.brand_id))];
    if (!ids.length) return [];
    // Solo lo que hace falta para la cara del cliente (la fila entera trae todos sus logos). Sin
    // migracion-redes.sql no hay logo_from: se pide sin eso.
    const pedir = (campos: string) => supabase.from("brands").select(campos).in("id", ids).order("name");
    let { data: brands, error: e2 } = await pedir("id, name, color, logo_url, logo_bg, logo_from");
    if (e2 && /logo_from/i.test(e2.message)) ({ data: brands, error: e2 } = await pedir("id, name, color, logo_url, logo_bg"));
    if (e2) throw new Error(e2.message);
    return ((brands ?? []) as unknown as Record<string, unknown>[]).map((b) => ({
      id: String(b.id),
      name: String(b.name),
      color: typeof b.color === "string" ? b.color : "#888888",
      logo_url: typeof b.logo_url === "string" ? b.logo_url : null,
      logo_bg: b.logo_bg === "dark" || b.logo_bg === "brand" ? b.logo_bg : "light",
      logo_from: typeof b.logo_from === "string" ? b.logo_from : null,
    }));
  },
};
