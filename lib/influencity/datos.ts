import { supabase } from "@/lib/supabase";
import { COLUMNAS_PUBLICACION, type Grupo, type Perfil, type Publicacion, type Rendimiento, type Tracking, type Vinculo } from "./tipos";

/**
 * Lo que la app lee de las tablas inf_* (con la sesión de quien mira; la base deja solo al
 * estudio). Lo que necesita el token de Influencity va por /api/influencity/*.
 */

type Res<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Supabase devuelve hasta 1000 filas por pedido: se piden de a 1000 hasta que no haya más. */
async function todas<T>(pedir: (desde: number, hasta: number) => Res<T>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; desde < 200_000; desde += 1000) {
    const { data, error } = await pedir(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

export type InfluencersData = {
  perfiles: Perfil[];
  rendimiento: Rendimiento[];
  trackings: Tracking[];
  grupos: Grupo[];
  vinculos: Vinculo[];
};

export async function cargarInfluencers(): Promise<InfluencersData> {
  const [perfiles, rendimiento, trackings, grupos, vinculos] = await Promise.all([
    todas<Perfil>((a, b) => supabase.from("inf_perfiles_lista").select("*").order("id").range(a, b)),
    todas<Rendimiento>((a, b) => supabase.from("inf_rendimiento").select("*").order("perfil_id").order("mes").range(a, b)),
    todas<Tracking>((a, b) =>
      supabase
        .from("inf_trackings")
        .select("id, nombre, estado, tipo, inicio, fin, origen, brand_id, brand_manual, publicaciones, leido, en_influencity")
        .order("inicio", { ascending: false, nullsFirst: false })
        .range(a, b)
    ),
    todas<Grupo>((a, b) => supabase.from("inf_grupos").select("*").order("nombre").range(a, b)),
    todas<Vinculo>((a, b) => supabase.from("inf_vinculos").select("*").order("creado", { ascending: false }).range(a, b)),
  ]);
  return {
    perfiles: perfiles.map((p) => ({ ...p, seguidores: p.seguidores == null ? null : Number(p.seguidores), engagement: p.engagement == null ? null : Number(p.engagement) })),
    rendimiento: rendimiento.map(numeros),
    trackings,
    grupos,
    vinculos,
  };
}

/** bigint llega como texto o número según el caso: todo a número. */
function numeros(r: Rendimiento): Rendimiento {
  const n = (v: unknown) => Number(v) || 0;
  return {
    ...r,
    publicaciones: n(r.publicaciones),
    views: n(r.views),
    likes: n(r.likes),
    comentarios: n(r.comentarios),
    compartidos: n(r.compartidos),
    guardados: n(r.guardados),
    impresiones: n(r.impresiones),
    alcance: n(r.alcance),
    interacciones: n(r.interacciones),
    engagement_suma: n(r.engagement_suma),
    engagement_n: n(r.engagement_n),
    patrocinadas: n(r.patrocinadas),
  };
}

/** Las publicaciones de un influencer (las suyas y las colaboraciones) o de un cliente. */
export async function cargarPublicaciones(filtro: { perfil?: string; brand?: string; tracking?: string }): Promise<Publicacion[]> {
  return todas<Publicacion>((a, b) => {
    let q = supabase.from("inf_publicaciones").select(COLUMNAS_PUBLICACION);
    if (filtro.perfil) q = q.contains("perfiles", [filtro.perfil]);
    if (filtro.brand) q = q.eq("brand_id", filtro.brand);
    if (filtro.tracking) q = q.contains("trackings", [filtro.tracking]);
    return q.order("fecha", { ascending: false, nullsFirst: false }).range(a, b) as unknown as Res<Publicacion>;
  });
}

/** El detalle completo de un perfil (audiencia, precio estimado…), tal como lo devolvió Influencity. */
export async function cargarDetalle(id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from("inf_perfiles").select("detalle").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.detalle as Record<string, unknown>) ?? null;
}

/** De qué cliente es una campaña, un cliente/campaña de Influencity o una publicación (null = de ninguno). */
export async function asignarCliente(tipo: "tracking" | "cliente" | "campana" | "publicacion", id: string, brand: string | null, auto = false) {
  const { error } = await supabase.rpc("inf_asignar", { p_tipo: tipo, p_id: id, p_brand: brand, p_auto: auto });
  if (error) throw new Error(error.message);
}

export async function vincular(v: { perfil_id: string; tipo: string; ref: string; brand_id?: string | null; titulo?: string | null; href?: string | null; nota?: string | null }) {
  const { error } = await supabase.from("inf_vinculos").upsert(
    { brand_id: null, titulo: null, href: null, nota: null, ...v },
    { onConflict: "perfil_id,tipo,ref" }
  );
  if (error) throw new Error(error.message);
}

export async function desvincular(id: string) {
  const { error } = await supabase.from("inf_vinculos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function guardarNotas(perfilId: string, notas: string) {
  const { error } = await supabase.from("inf_perfiles").update({ notas: notas.trim() || null }).eq("id", perfilId);
  if (error) throw new Error(error.message);
}
