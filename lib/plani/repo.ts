import { supabase } from "@/lib/supabase";
import { FORMATOS } from "./config";
import type { Comentario, Formato, Pieza, PiezaPatch, Plani, PlaniPatch, PlaniResumen, PlaniTipo, Plataforma, Proporcion } from "./types";

/** Lo que se trae de cada pieza para la lista (sin copys ni indicaciones: solo para contar y mostrar el feed). */
const RESUMEN = "id, formato, fecha, programada, estado_agencia, estado_cliente, medios";

export const planiRepo = {
  list: () =>
    supabase
      .from("presentaciones")
      .select(`*, presentacion_piezas(${RESUMEN})`)
      .order("anio", { ascending: false })
      .order("mes", { ascending: false })
      .returns<PlaniResumen[]>(),

  /** Las planis de un cliente, la más nueva primero. */
  porCliente: (brandId: string) =>
    supabase
      .from("presentaciones")
      .select(`*, presentacion_piezas(${RESUMEN})`)
      .eq("brand_id", brandId)
      .order("anio", { ascending: false })
      .order("mes", { ascending: false })
      .returns<PlaniResumen[]>(),

  get: (id: string) => supabase.from("presentaciones").select("*").eq("id", id).maybeSingle<Plani>(),

  create: (input: { brand_id: string; anio: number; mes: number; tipo: PlaniTipo; titulo: string; bc_tarea_id?: number | null }) =>
    supabase.from("presentaciones").insert(input).select().single<Plani>(),

  update: (id: string, patch: PlaniPatch) => supabase.from("presentaciones").update(patch).eq("id", id).select().single<Plani>(),

  remove: (id: string) => supabase.from("presentaciones").delete().eq("id", id),

  piezas: (planiId: string) =>
    supabase
      .from("presentacion_piezas")
      .select("*")
      .eq("presentacion_id", planiId)
      .order("fecha")
      .order("orden")
      .order("created_at")
      .returns<Pieza[]>(),

  createPieza: (input: Partial<Pieza> & { presentacion_id: string; fecha: string; formato: Formato }) =>
    supabase.from("presentacion_piezas").insert(input).select().single<Pieza>(),

  updatePieza: (id: string, patch: PiezaPatch) =>
    supabase.from("presentacion_piezas").update(patch).eq("id", id).select().single<Pieza>(),

  removePieza: (id: string) => supabase.from("presentacion_piezas").delete().eq("id", id),

  comentarios: (planiId: string) =>
    supabase.from("presentacion_comentarios").select("*").eq("presentacion_id", planiId).order("created_at").returns<Comentario[]>(),

  comentar: (input: { presentacion_id: string; pieza_id: string | null; texto: string; autor_nombre: string; interno: boolean }) =>
    supabase.from("presentacion_comentarios").insert(input).select().single<Comentario>(),

  resolver: (id: string, resuelto: boolean) =>
    supabase.from("presentacion_comentarios").update({ resuelto }).eq("id", id).select().single<Comentario>(),

  borrarComentario: (id: string) => supabase.from("presentacion_comentarios").delete().eq("id", id),
};

/** Una pieza nueva con lo mínimo para empezar: un carrusel arranca con 3 slides. */
export function piezaNueva(
  presentacion_id: string,
  fecha: string,
  formato: Formato,
  extra: Partial<Pieza> = {}
): Partial<Pieza> & { presentacion_id: string; fecha: string; formato: Formato } {
  const proporcion: Proporcion = FORMATOS[formato].proporciones[0];
  const plataformas: Plataforma[] = ["instagram"];
  return {
    presentacion_id,
    fecha,
    formato,
    proporcion,
    plataformas,
    slides: formato === "carrusel" ? [{ instruccion: "" }, { instruccion: "" }, { instruccion: "" }] : [],
    ...extra,
  };
}

/** Falta correr supabase/migracion-presentaciones.sql: las tablas no existen. */
export const isMissingPlaniMigration = (message: string) =>
  /presentaciones|presentacion_piezas|presentacion_comentarios|presentacion_tipos|schema cache|does not exist/i.test(message);

export function planiErrorMessage(error: { message: string }) {
  if (/compartida|share_token|presentacion_publica/i.test(error.message)) return "Falta correr supabase/migracion-presentaciones-cliente.sql en Supabase";
  if (isMissingPlaniMigration(error.message)) return "Falta correr supabase/migracion-presentaciones.sql en Supabase";
  return error.message;
}
