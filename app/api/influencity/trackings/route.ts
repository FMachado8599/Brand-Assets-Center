import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiTracking } from "@/lib/influencity/api";
import { conInfluencity, ID_INFLUENCITY } from "@/lib/influencity/ruta";

export const dynamic = "force-dynamic";

type Body = {
  tipo?: "custom" | "perfil";
  nombre?: string;
  descripcion?: string;
  inicio?: string;
  fin?: string;
  hashtags?: string[];
  menciones?: string[];
  keywords?: string[];
  perfiles?: string[];
  perfil_id?: string;
  brand_id?: string | null;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Hasta 5, sin # ni @, sin repetir. */
const lista = (xs: unknown, prefijo: RegExp) =>
  [...new Set((Array.isArray(xs) ? xs : []).map((x) => String(x).trim().replace(prefijo, "")).filter(Boolean))].slice(0, 5);

/**
 * Crear una campaña en Influencity: "custom" (lo que se publique con ciertos hashtags, menciones o
 * palabras entre dos fechas, opcionalmente solo de ciertos perfiles) o "perfil" (todo lo que publica
 * un perfil). Queda guardada acá con el cliente elegido.
 */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as Body;
  const brand = b.brand_id && UUID.test(b.brand_id) ? b.brand_id : null;

  if (b.tipo === "perfil") {
    if (!b.perfil_id || !ID_INFLUENCITY.test(b.perfil_id)) return NextResponse.json({ error: "Falta el perfil" }, { status: 400 });
    const perfilId = b.perfil_id;
    return conInfluencity(async (api, db) => {
      const t = await api.crearTrackingDePerfil(perfilId);
      await guardar(db, t, brand);
      return { tracking: t.trackingId };
    });
  }

  const nombre = b.nombre?.trim() ?? "";
  const hashtags = lista(b.hashtags, /^#+/);
  const menciones = lista(b.menciones, /^@+/);
  const keywords = lista(b.keywords, /^$/);
  const perfiles = [...new Set((Array.isArray(b.perfiles) ? b.perfiles : []).filter((p) => typeof p === "string" && ID_INFLUENCITY.test(p)))];
  const hoy = new Date().toISOString().slice(0, 10);
  if (!nombre) return NextResponse.json({ error: "Ponele un nombre a la campaña" }, { status: 400 });
  if (!b.inicio || !FECHA.test(b.inicio) || !b.fin || !FECHA.test(b.fin)) return NextResponse.json({ error: "Faltan las fechas" }, { status: 400 });
  if (b.inicio < hoy) return NextResponse.json({ error: "Influencity no deja empezar una campaña en el pasado" }, { status: 400 });
  if (b.fin < b.inicio) return NextResponse.json({ error: "La fecha de fin es antes que la de inicio" }, { status: 400 });
  if (!hashtags.length && !menciones.length && !keywords.length) {
    return NextResponse.json({ error: "Poné al menos un hashtag, una mención o una palabra clave" }, { status: 400 });
  }

  return conInfluencity(async (api, db) => {
    const t = await api.crearTracking({
      name: nombre,
      description: b.descripcion?.trim() || undefined,
      hashtags,
      mentions: menciones,
      keywords,
      profileIds: perfiles.length ? perfiles : undefined,
      startDate: b.inicio!,
      endDate: b.fin!,
    });
    await guardar(db, { ...t, type: t.type ?? "custom" }, brand);
    return { tracking: t.trackingId };
  });
}

async function guardar(db: SupabaseClient, t: ApiTracking, brand: string | null) {
  const { error } = await db.from("inf_trackings").upsert({
    id: t.trackingId,
    nombre: t.name,
    estado: t.status?.toLowerCase() ?? null,
    tipo: t.type ?? null,
    inicio: t.startDate || null,
    fin: t.endDate || null,
    origen: t.createdFrom ?? "api",
    brand_id: brand,
    brand_manual: Boolean(brand),
    en_influencity: true,
  });
  if (error) throw new Error(error.message);
}
