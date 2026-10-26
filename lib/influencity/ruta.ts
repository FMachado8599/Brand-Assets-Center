import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";
import { Influencity, InfluencityError, mensajeInfluencity } from "./api";
import { faltaMigracionInfluencers } from "./tipos";

export const ID_INFLUENCITY = /^[a-f0-9]{24}$/i;

/**
 * Lo común de las rutas que hablan con Influencity: la base con la sesión de quien pide, el
 * cliente de la API con el token guardado y los errores en palabras de la app.
 */
export async function conInfluencity(fn: (api: Influencity, db: SupabaseClient) => Promise<unknown>) {
  const db = createSupabaseServer();
  try {
    const api = await Influencity.desde(db);
    if (!api) return NextResponse.json({ error: "Influencity no está conectado" }, { status: 400 });
    return NextResponse.json(await fn(api, db));
  } catch (e) {
    return errorJson(e);
  }
}

export function errorJson(e: unknown) {
  if (e instanceof InfluencityError) {
    // Un 401 de Influencity no es un 401 de la app (la sesión está bien): se manda como 502.
    const status = e.status === 401 ? 502 : e.status >= 400 && e.status < 600 ? e.status : 500;
    return NextResponse.json({ error: mensajeInfluencity(e), code: e.code }, { status });
  }
  const message = (e as Error).message;
  const sinMigracion = faltaMigracionInfluencers(message);
  return NextResponse.json(
    { error: sinMigracion ? "Falta correr supabase/migracion-influencers.sql en Supabase" : message, sinMigracion },
    { status: sinMigracion ? 503 : 500 }
  );
}
