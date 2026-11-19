import { supabase } from "@/lib/supabase";
import { tipoDeTitulo, type TipoPresentacion } from "./tipos";

/** Lo que guardamos de Basecamp (supabase/migracion-integraciones.sql), visto desde la app. */

export type BcProyecto = {
  id: number;
  nombre: string;
  estado: string;
  app_url: string | null;
  brand_id: string | null;
  ignorado: boolean;
};

export type BcPersona = { id: number; nombre: string; email: string | null; avatar_url: string | null; cargo: string | null };

export type BcColumna = { id: number; tablero_id: number | null; nombre: string; estado: string | null };

export type BcTarea = {
  id: number;
  proyecto_id: number;
  columna_id: number | null;
  titulo: string;
  contenido: string | null;
  app_url: string | null;
  vence: string | null;
  completada: boolean;
  asignados: number[];
  comentarios: number;
  creada: string | null;
  actualizada: string | null;
};

/** Una tarea con todo lo que hace falta para mostrarla: etapa, sector y gente. */
export type TareaCompleta = BcTarea & {
  columna: BcColumna | null;
  sector: string | null;
  personas: BcPersona[];
  proyecto: Pick<BcProyecto, "id" | "nombre" | "app_url"> | null;
};

/** Las etapas en las que una tarea ya no está viva (terminada o en pausa). */
export const ETAPAS_CERRADAS = new Set(["done", "not_now"]);

export const ETAPA_LABEL: Record<string, string> = {
  triage: "Triage",
  para_hacer: "Para hacer",
  asignada: "Asignada",
  en_proceso: "En proceso",
  validacion: "Validación interna",
  cliente: "En cliente",
  implementacion: "Implementación",
  done: "Hecha",
  not_now: "En pausa",
};

async function completar(tareas: BcTarea[]): Promise<TareaCompleta[]> {
  if (!tareas.length) return [];
  const colIds = [...new Set(tareas.map((t) => t.columna_id).filter((x): x is number => x != null))];
  const perIds = [...new Set(tareas.flatMap((t) => t.asignados))];
  const proIds = [...new Set(tareas.map((t) => t.proyecto_id))];
  const [cols, pers, pros] = await Promise.all([
    colIds.length ? supabase.from("bc_columnas").select("id, tablero_id, nombre, estado").in("id", colIds) : Promise.resolve({ data: [] }),
    perIds.length ? supabase.from("bc_personas").select("id, nombre, email, avatar_url, cargo").in("id", perIds) : Promise.resolve({ data: [] }),
    supabase.from("bc_proyectos").select("id, nombre, app_url").in("id", proIds),
  ]);
  const columnas = new Map(((cols.data ?? []) as BcColumna[]).map((c) => [Number(c.id), c]));
  const tabIds = [...new Set([...columnas.values()].map((c) => c.tablero_id).filter((x): x is number => x != null))];
  const tabs = tabIds.length ? await supabase.from("bc_tableros").select("id, nombre").in("id", tabIds) : { data: [] };
  const tableros = new Map(((tabs.data ?? []) as { id: number; nombre: string }[]).map((t) => [Number(t.id), t.nombre]));
  const personas = new Map(((pers.data ?? []) as BcPersona[]).map((p) => [Number(p.id), p]));
  const proyectos = new Map(((pros.data ?? []) as Pick<BcProyecto, "id" | "nombre" | "app_url">[]).map((p) => [Number(p.id), p]));

  return tareas.map((t) => {
    const columna = t.columna_id != null ? columnas.get(Number(t.columna_id)) ?? null : null;
    return {
      ...t,
      columna,
      sector: columna?.tablero_id != null ? tableros.get(Number(columna.tablero_id)) ?? null : null,
      personas: t.asignados.map((id) => personas.get(Number(id))).filter((p): p is BcPersona => !!p),
      proyecto: proyectos.get(Number(t.proyecto_id)) ?? null,
    };
  });
}

export const basecampRepo = {
  async tarea(id: number) {
    const { data, error } = await supabase.from("bc_tareas").select("*").eq("id", id).maybeSingle();
    if (error || !data) return { data: null, error };
    const [t] = await completar([data as BcTarea]);
    return { data: t, error: null };
  },

  /** Las tareas vivas de un cliente (de todos sus proyectos), lo último que se movió primero. */
  async tareasDeCliente(brandId: string, limite = 120) {
    const { data: pros, error } = await supabase.from("bc_proyectos").select("id").eq("brand_id", brandId);
    if (error) return { data: [] as TareaCompleta[], error };
    const ids = (pros ?? []).map((p) => p.id);
    if (!ids.length) return { data: [] as TareaCompleta[], error: null };
    const { data, error: e2 } = await supabase
      .from("bc_tareas")
      .select("*")
      .in("proyecto_id", ids)
      .eq("completada", false)
      .order("actualizada", { ascending: false })
      .limit(limite);
    if (e2) return { data: [] as TareaCompleta[], error: e2 };
    const completas = await completar((data ?? []) as BcTarea[]);
    return { data: completas.filter((t) => !ETAPAS_CERRADAS.has(t.columna?.estado ?? "")), error: null };
  },

  /**
   * Las tareas vivas que se reconocen como de algún tipo de presentación (por las palabras de su
   * título) y todavía no tienen una, para sugerir crearla. Se leen las últimas que se movieron y se
   * filtran acá: así "Planificación" (con tilde) también coincide con la palabra "planificacion".
   */
  async sinPresentacion(vinculadas: Set<number>, tipos: TipoPresentacion[], limite = 60) {
    const { data, error } = await supabase
      .from("bc_tareas")
      .select("*")
      .eq("completada", false)
      .order("actualizada", { ascending: false })
      .limit(600);
    if (error) return { data: [] as TareaCompleta[], error };
    const candidatas = ((data ?? []) as BcTarea[])
      .filter((t) => !vinculadas.has(Number(t.id)) && tipoDeTitulo(t.titulo, tipos))
      .slice(0, limite * 2);
    const completas = await completar(candidatas);
    return { data: completas.filter((t) => !ETAPAS_CERRADAS.has(t.columna?.estado ?? "")).slice(0, limite), error: null };
  },

  proyectos: () => supabase.from("bc_proyectos").select("id, nombre, estado, app_url, brand_id, ignorado").order("nombre"),

  marcarIgnorado: (id: number, ignorado: boolean) => supabase.from("bc_proyectos").update({ ignorado }).eq("id", id),

  vincular: (id: number, brandId: string | null) => supabase.from("bc_proyectos").update({ brand_id: brandId }).eq("id", id),
};

/** "Setiembre" / "Septiembre" / "sept" en el título de una tarea → el número de mes. */
export function mesDelTitulo(titulo: string): number | null {
  const t = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const nombres = [/enero/, /febrero/, /marzo/, /abril/, /mayo/, /junio/, /julio/, /agosto/, /se?tiembre|sept?\b/, /octubre/, /noviembre/, /diciembre/];
  const i = nombres.findIndex((rx) => rx.test(t));
  return i >= 0 ? i + 1 : null;
}

/**
 * El mes y el año de una tarea por su título ("Plani Octubre", "Leads enero 2027"). Si no dice el
 * año, el más cercano a hoy: en diciembre, "Plani Enero" es del año que viene.
 */
export function periodoDelTitulo(titulo: string, hoy = new Date()): { anio: number; mes: number } | null {
  const mes = mesDelTitulo(titulo);
  if (!mes) return null;
  const dice = titulo.match(/\b(20\d{2})\b/);
  if (dice) return { anio: Number(dice[1]), mes };
  const ahora = hoy.getFullYear() * 12 + hoy.getMonth();
  const anio = [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1].sort(
    (a, b) => Math.abs(a * 12 + mes - 1 - ahora) - Math.abs(b * 12 + mes - 1 - ahora)
  )[0];
  return { anio, mes };
}
