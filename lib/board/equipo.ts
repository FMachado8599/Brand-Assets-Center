import { supabase } from "@/lib/supabase";

/**
 * El equipo del estudio (supabase/migracion-equipo.sql): sectores, puestos, personas, hubs y
 * designados por marca. Todo se lee con la sesión de quien pide; los permisos los pone la base
 * (todos leen, los admins configuran, cada uno puede elegir sus marcas).
 */

export type Nivel = "direccion" | "coordinacion" | "operativo";

export const NIVELES: Nivel[] = ["direccion", "coordinacion", "operativo"];

export const NIVEL_LABEL: Record<Nivel, string> = {
  direccion: "Dirección",
  coordinacion: "Coordinación",
  operativo: "Operativo",
};

export type Sector = { id: string; nombre: string; area: string; tablero: string | null; orden: number };

export type Puesto = { id: string; nombre: string; nivel: Nivel; orden: number; sectores: string[] };

export type Persona = {
  id: string;
  nombre: string;
  email: string | null;
  bc_persona_id: number | null;
  rol: "admin" | "empleado";
  hub_id: string | null;
  activo: boolean;
  puestos: string[];
  /** De Basecamp: la foto y el cargo que tiene escrito ahí (solo informativo). */
  avatar_url: string | null;
  cargo: string | null;
  /** null: activo según su actividad · true/false: lo fijó un admin a mano. */
  activo_manual: boolean | null;
  /** Lo último que hizo (Basecamp, etiquetada en una tarea nueva o en la app); null si nada. */
  ultima_actividad: string | null;
  /** Ya se leyó su actividad en Basecamp (si no, la regla de activos no la toca). */
  actividad_medida: boolean;
};

export type Hub = { id: string; nombre: string; lider_id: string | null; marcas: string[] };

/** "Facu es el diseñador designado de Changan". */
export type Designacion = { brand_id: string; sector_id: string; persona_id: string };

/** Quién entró: su fila del equipo (si ya está) y su persona de Basecamp. */
export type Yo = {
  email: string;
  equipo_id: string | null;
  nombre: string | null;
  rol: "admin" | "empleado" | null;
  admin: boolean;
  bc_persona_id: number | null;
};

export type EquipoData = {
  sectores: Sector[];
  puestos: Puesto[];
  personas: Persona[];
  hubs: Hub[];
  designaciones: Designacion[];
  yo: Yo | null;
  /** Ya se corrió migracion-actividad.sql (activo según la actividad). */
  conActividad: boolean;
};

/** Falta correr supabase/migracion-equipo.sql. */
export const faltaMigracionEquipo = (message: string) =>
  /sectores|puestos|equipo|hubs|marca_equipo|board_yo|board_tareas|schema cache|does not exist|42P01|PGRST20/i.test(message);

type Res<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

async function leer<T>(q: Res<T>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

export async function cargarEquipo(): Promise<EquipoData> {
  // Lo de la actividad (migracion-actividad.sql) puede no estar todavía: sin eso, todo lo demás anda igual.
  const actividad = await supabase.rpc("equipo_actividad");
  const conActividad = !actividad.error;
  const [sectores, puestos, puestoSectores, equipo, equipoPuestos, hubs, hubMarcas, designaciones, bc, yo] = await Promise.all([
    leer<Sector[]>(supabase.from("sectores").select("id, nombre, area, tablero, orden").order("orden")),
    leer<Omit<Puesto, "sectores">[]>(supabase.from("puestos").select("id, nombre, nivel, orden").order("orden").order("nombre")),
    leer<{ puesto_id: string; sector_id: string }[]>(supabase.from("puesto_sectores").select("puesto_id, sector_id")),
    // Sin migracion-actividad.sql no hay activo_manual.
    leer<(Omit<Persona, "puestos" | "avatar_url" | "cargo" | "ultima_actividad" | "actividad_medida" | "activo_manual"> & { activo_manual?: boolean | null })[]>(
      conActividad
        ? supabase.from("equipo").select("id, nombre, email, bc_persona_id, rol, hub_id, activo, activo_manual").order("nombre")
        : supabase.from("equipo").select("id, nombre, email, bc_persona_id, rol, hub_id, activo").order("nombre")
    ),
    leer<{ persona_id: string; puesto_id: string }[]>(supabase.from("equipo_puestos").select("persona_id, puesto_id")),
    leer<{ id: string; nombre: string; lider_id: string | null }[]>(supabase.from("hubs").select("id, nombre, lider_id").order("nombre")),
    leer<{ hub_id: string; brand_id: string }[]>(supabase.from("hub_marcas").select("hub_id, brand_id")),
    leer<Designacion[]>(supabase.from("marca_equipo").select("brand_id, sector_id, persona_id").eq("principal", true)),
    leer<{ id: number; avatar_url: string | null; cargo: string | null }[]>(supabase.from("bc_personas").select("id, avatar_url, cargo")),
    supabase.rpc("board_yo").then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return (data ?? null) as Yo | null;
    }),
  ]);

  const agrupar = <K extends string, V>(filas: { k: K; v: V }[]) => {
    const m = new Map<K, V[]>();
    for (const { k, v } of filas) m.set(k, [...(m.get(k) ?? []), v]);
    return m;
  };
  const sectoresDe = agrupar(puestoSectores.map((p) => ({ k: p.puesto_id, v: p.sector_id })));
  const puestosDe = agrupar(equipoPuestos.map((p) => ({ k: p.persona_id, v: p.puesto_id })));
  const marcasDe = agrupar(hubMarcas.map((h) => ({ k: h.hub_id, v: h.brand_id })));
  const deBasecamp = new Map(bc.map((p) => [Number(p.id), p]));
  const actividadDe = new Map(
    ((actividad.data ?? []) as { persona_id: string; ultima: string | null; medida: boolean }[]).map((a) => [a.persona_id, a])
  );

  return {
    sectores,
    puestos: puestos.map((p) => ({ ...p, sectores: sectoresDe.get(p.id) ?? [] })),
    personas: equipo.map((p) => {
      const b = p.bc_persona_id != null ? deBasecamp.get(Number(p.bc_persona_id)) : undefined;
      return {
        ...p,
        bc_persona_id: p.bc_persona_id != null ? Number(p.bc_persona_id) : null,
        puestos: puestosDe.get(p.id) ?? [],
        avatar_url: b?.avatar_url ?? null,
        cargo: b?.cargo ?? null,
        activo_manual: p.activo_manual ?? null,
        ultima_actividad: actividadDe.get(p.id)?.ultima ?? null,
        actividad_medida: actividadDe.get(p.id)?.medida ?? false,
      };
    }),
    hubs: hubs.map((h) => ({ ...h, marcas: marcasDe.get(h.id) ?? [] })),
    designaciones,
    yo: yo ? { ...yo, bc_persona_id: yo.bc_persona_id != null ? Number(yo.bc_persona_id) : null } : null,
    conActividad,
  };
}

async function hacer(q: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await q;
  if (error) throw new Error(error.message);
}

/** Lo que cambió entre dos listas: qué sumar y qué sacar. */
const diferencia = (antes: string[], despues: string[]) => ({
  sumar: despues.filter((x) => !antes.includes(x)),
  sacar: antes.filter((x) => !despues.includes(x)),
});

export const equipoRepo = {
  /** Suma a la gente del estudio que está en Basecamp y todavía no está en el equipo. Devuelve cuántos. */
  async traerDeBasecamp() {
    const { data, error } = await supabase.rpc("traer_equipo_de_basecamp");
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  },

  actualizarPersona: (id: string, patch: Partial<Pick<Persona, "rol" | "hub_id" | "activo" | "activo_manual" | "nombre" | "email">>) =>
    hacer(supabase.from("equipo").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id)),

  async ponerPuestos(personaId: string, antes: string[], despues: string[]) {
    const { sumar, sacar } = diferencia(antes, despues);
    if (sacar.length) await hacer(supabase.from("equipo_puestos").delete().eq("persona_id", personaId).in("puesto_id", sacar));
    if (sumar.length) await hacer(supabase.from("equipo_puestos").insert(sumar.map((puesto_id) => ({ persona_id: personaId, puesto_id }))));
  },

  /** Deja a esa persona como designada de la marca en ese sector (si había otra, la reemplaza). */
  async designar(brandId: string, sectorId: string, personaId: string) {
    await hacer(supabase.from("marca_equipo").delete().eq("brand_id", brandId).eq("sector_id", sectorId).neq("persona_id", personaId));
    await hacer(
      supabase
        .from("marca_equipo")
        .upsert({ brand_id: brandId, sector_id: sectorId, persona_id: personaId, principal: true }, { onConflict: "brand_id,sector_id,persona_id" })
    );
  },

  quitarDesignacion: (brandId: string, sectorId: string, personaId: string) =>
    hacer(supabase.from("marca_equipo").delete().eq("brand_id", brandId).eq("sector_id", sectorId).eq("persona_id", personaId)),

  crearHub: (nombre: string) => hacer(supabase.from("hubs").insert({ nombre: nombre.trim() })),
  actualizarHub: (id: string, patch: { nombre?: string; lider_id?: string | null }) => hacer(supabase.from("hubs").update(patch).eq("id", id)),
  borrarHub: (id: string) => hacer(supabase.from("hubs").delete().eq("id", id)),

  /** Una marca está en un solo hub: las que vienen de otro se mueven. */
  async ponerMarcasHub(hubId: string, antes: string[], despues: string[]) {
    const { sumar, sacar } = diferencia(antes, despues);
    if (sacar.length) await hacer(supabase.from("hub_marcas").delete().eq("hub_id", hubId).in("brand_id", sacar));
    if (sumar.length) {
      await hacer(supabase.from("hub_marcas").delete().in("brand_id", sumar));
      await hacer(supabase.from("hub_marcas").insert(sumar.map((brand_id) => ({ hub_id: hubId, brand_id }))));
    }
  },

  async crearPuesto(nombre: string, nivel: Nivel, sectores: string[]) {
    const { data, error } = await supabase.from("puestos").insert({ nombre: nombre.trim(), nivel, orden: 1000 }).select("id").single();
    if (error) throw new Error(error.message);
    if (sectores.length) {
      await hacer(supabase.from("puesto_sectores").insert(sectores.map((sector_id) => ({ puesto_id: data.id, sector_id }))));
    }
  },

  actualizarPuesto: (id: string, patch: { nombre?: string; nivel?: Nivel }) => hacer(supabase.from("puestos").update(patch).eq("id", id)),

  async ponerSectoresPuesto(puestoId: string, antes: string[], despues: string[]) {
    const { sumar, sacar } = diferencia(antes, despues);
    if (sacar.length) await hacer(supabase.from("puesto_sectores").delete().eq("puesto_id", puestoId).in("sector_id", sacar));
    if (sumar.length) await hacer(supabase.from("puesto_sectores").insert(sumar.map((sector_id) => ({ puesto_id: puestoId, sector_id }))));
  },

  borrarPuesto: (id: string) => hacer(supabase.from("puestos").delete().eq("id", id)),
};

/** Los errores de la base, en palabras de la app. */
export function equipoErrorMessage(message: string) {
  if (/row-level security|permission denied/i.test(message)) return "No tenés permiso para cambiar eso (es de admins).";
  if (/marca_equipo_un_designado/i.test(message)) return "Esa marca ya tiene designado en ese sector.";
  if (/no tiene un puesto de ese sector/i.test(message)) return "Esa persona no tiene un puesto de ese sector.";
  if (/puestos_nombre_key|hubs_nombre_key|duplicate/i.test(message)) return "Ya hay uno con ese nombre.";
  return message;
}
