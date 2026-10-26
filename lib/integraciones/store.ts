import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "./crypto";

export type Proveedor = "basecamp" | "google" | "influencity";

/** Una conexión, con los tokens ya descifrados. Solo existe en el servidor. */
export type Conexion = {
  proveedor: Proveedor;
  cuenta_id: string | null;
  cuenta_nombre: string | null;
  conectada_por: string | null;
  accessToken: string;
  refreshToken: string | null;
  expira: Date | null;
  datos: Record<string, unknown>;
  conectada: string;
};

/** Lo que se puede mostrar en la app de una conexión (sin tokens). */
export type ConexionPublica = Pick<Conexion, "proveedor" | "cuenta_id" | "cuenta_nombre" | "conectada_por" | "conectada"> & {
  datos: Record<string, unknown>;
};

type Row = {
  proveedor: Proveedor;
  cuenta_id: string | null;
  cuenta_nombre: string | null;
  conectada_por: string | null;
  access_token: string;
  refresh_token: string | null;
  expira: string | null;
  datos: Record<string, unknown> | null;
  conectada: string;
};

/**
 * Las conexiones se leen y escriben con la sesión de quien hace el pedido (solo el estudio, por RLS).
 * Los tokens viajan cifrados hasta acá y se descifran recién en el servidor.
 */
export async function leerConexion(db: SupabaseClient, proveedor: Proveedor): Promise<Conexion | null> {
  const { data, error } = await db.from("integraciones").select("*").eq("proveedor", proveedor).maybeSingle<Row>();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    proveedor: data.proveedor,
    cuenta_id: data.cuenta_id,
    cuenta_nombre: data.cuenta_nombre,
    conectada_por: data.conectada_por,
    accessToken: decrypt(data.access_token),
    refreshToken: data.refresh_token ? decrypt(data.refresh_token) : null,
    expira: data.expira ? new Date(data.expira) : null,
    datos: data.datos ?? {},
    conectada: data.conectada,
  };
}

export async function leerPublicas(db: SupabaseClient): Promise<ConexionPublica[]> {
  const { data, error } = await db
    .from("integraciones")
    .select("proveedor, cuenta_id, cuenta_nombre, conectada_por, conectada, datos");
  if (error) throw new Error(error.message);
  return (data ?? []) as ConexionPublica[];
}

export async function guardarConexion(
  db: SupabaseClient,
  c: {
    proveedor: Proveedor;
    cuenta_id?: string | null;
    cuenta_nombre?: string | null;
    conectada_por?: string | null;
    accessToken: string;
    refreshToken?: string | null;
    expira?: Date | null;
    datos?: Record<string, unknown>;
  }
) {
  const { error } = await db.from("integraciones").upsert({
    proveedor: c.proveedor,
    cuenta_id: c.cuenta_id ?? null,
    cuenta_nombre: c.cuenta_nombre ?? null,
    conectada_por: c.conectada_por ?? null,
    access_token: encrypt(c.accessToken),
    refresh_token: c.refreshToken ? encrypt(c.refreshToken) : null,
    expira: c.expira?.toISOString() ?? null,
    datos: c.datos ?? {},
    conectada: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** Después de renovar un token: solo cambian los tokens y el vencimiento. */
export async function renovarTokens(
  db: SupabaseClient,
  proveedor: Proveedor,
  t: { accessToken: string; refreshToken?: string | null; expira: Date | null }
) {
  const patch: Record<string, unknown> = {
    access_token: encrypt(t.accessToken),
    expira: t.expira?.toISOString() ?? null,
    updated_at: new Date().toISOString(),
  };
  if (t.refreshToken) patch.refresh_token = encrypt(t.refreshToken);
  const { error } = await db.from("integraciones").update(patch).eq("proveedor", proveedor);
  if (error) throw new Error(error.message);
}

export async function guardarDatos(db: SupabaseClient, proveedor: Proveedor, datos: Record<string, unknown>) {
  const { error } = await db.from("integraciones").update({ datos, updated_at: new Date().toISOString() }).eq("proveedor", proveedor);
  if (error) throw new Error(error.message);
}

export async function borrarConexion(db: SupabaseClient, proveedor: Proveedor) {
  const { error } = await db.from("integraciones").delete().eq("proveedor", proveedor);
  if (error) throw new Error(error.message);
}

/** El origen público de la app (para armar las URLs de vuelta de OAuth). */
export function appOrigin(requestUrl: string) {
  return process.env.APP_URL?.replace(/\/$/, "") || new URL(requestUrl).origin;
}
