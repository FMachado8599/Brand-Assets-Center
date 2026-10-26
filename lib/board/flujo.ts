import { supabase } from "@/lib/supabase";
import type { EquipoData, Persona } from "./equipo";
import type { TareaBoard } from "./tareas";

/**
 * El flujo de cada tarea dentro del estudio (supabase/migracion-flujo.sql): en qué etapa está en la
 * app, quién la tiene, su prioridad, si está en pausa y hasta cuándo vale. Basecamp no se toca: si
 * alguien mueve la tarjeta allá, la app la sigue.
 */

export type Etapa = "entrada" | "redaccion" | "diseno" | "en_proceso" | "validacion" | "cliente" | "implementacion" | "finalizada";

/** Digital: "En proceso" se divide en Redacción y Diseño. */
export const ETAPAS_DIGITAL: Etapa[] = ["entrada", "redaccion", "diseno", "validacion", "cliente", "implementacion", "finalizada"];
export const ETAPAS_OTRAS: Etapa[] = ["entrada", "en_proceso", "validacion", "cliente", "implementacion", "finalizada"];

export const ETAPA_LABEL: Record<Etapa, string> = {
  entrada: "Entrada",
  redaccion: "Redacción",
  diseno: "Diseño",
  en_proceso: "En proceso",
  validacion: "Validación interna",
  cliente: "Cliente",
  implementacion: "Implementación",
  finalizada: "Finalizada",
};

export const etapasDe = (tablero: string | null) => (tablero === "Digital" ? ETAPAS_DIGITAL : ETAPAS_OTRAS);

/** El sector que trabaja cada etapa (igual que flujo_sector en la base). */
export function sectorDeEtapa(etapa: Etapa, tablero: string | null, data: Pick<EquipoData, "sectores">): string | null {
  switch (etapa) {
    case "redaccion":
      return "redaccion";
    case "diseno":
      return "diseno_digital";
    case "implementacion":
      return "cm";
    case "cliente":
      return "cuentas";
    case "en_proceso":
      return data.sectores.find((s) => s.tablero === tablero)?.id ?? null;
    default:
      return null;
  }
}

/** Para las tareas que todavía no tienen flujo: lo que dice su columna de Basecamp (igual que flujo_etapa_bc). */
export function etapaDesdeBasecamp(t: Pick<TareaBoard, "estado" | "columna" | "tablero" | "completada">): Etapa {
  if (t.completada || t.estado === "done" || /^factur/i.test(t.columna ?? "")) return "finalizada";
  if (t.estado === "en_proceso") return t.tablero === "Digital" ? "redaccion" : "en_proceso";
  if (t.estado === "validacion" || t.estado === "cliente" || t.estado === "implementacion") return t.estado;
  return "entrada";
}

export type TareaFlujo = TareaBoard & {
  etapa: Etapa | null;
  responsable_id: string | null;
  orden: number | null;
  pausada: boolean;
  pausa_motivo: string | null;
  vigente_hasta: string | null;
  vigente_origen: "manual" | "ia" | null;
  /** vigente_hasta o, si no tiene, la fecha de entrega de Basecamp. */
  vigencia: string | null;
};

export const etapaDe = (t: TareaFlujo): Etapa => t.etapa ?? etapaDesdeBasecamp(t);

export type Movimiento = {
  id: number;
  tarea_id: number;
  tipo: "etapa" | "responsable" | "pausa" | "fecha" | "validacion";
  de: string | null;
  a: string | null;
  nota: string | null;
  autor_id: string | null;
  origen: "app" | "basecamp" | "ia";
  creado: string;
};

/* ───────────── Prioridad ───────────── */

const DIA = 86_400_000;
const diaDe = (iso: string) => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / DIA);

/**
 * La clave con la que se ordena una columna: la prioridad que se puso arrastrando o, si nadie la
 * tocó, la fecha de entrega (las que vencen antes, arriba). Están en la misma escala, así que una
 * tarea arrastrada queda entre las dos que tenía al lado.
 */
export function claveOrden(t: Pick<TareaFlujo, "orden" | "vence" | "id">) {
  if (t.orden != null) return t.orden;
  if (t.vence) return diaDe(t.vence);
  return 1_000_000 + (t.id % 100_000) / 100_000;
}

export const ordenarPorPrioridad = <T extends Pick<TareaFlujo, "orden" | "vence" | "id">>(lista: T[]) =>
  [...lista].sort((a, b) => claveOrden(a) - claveOrden(b));

/** La prioridad para soltar entre dos tareas (o arriba de todo, o abajo de todo). */
export function ordenEntre(antes?: number, despues?: number) {
  if (antes == null && despues == null) return 0;
  if (antes == null) return despues! - 1;
  if (despues == null) return antes + 1;
  return (antes + despues) / 2;
}

/* ───────────── Quién la tiene ───────────── */

export type Responsable = {
  persona: Persona | null;
  /** tomada: alguien la tomó o se la pasaron · designado: la de la marca · basecamp: el único asignado allá del sector. */
  origen: "tomada" | "designado" | "basecamp" | null;
  sector: string | null;
};

export type Contexto = {
  data: EquipoData;
  porId: Map<string, Persona>;
  porBc: Map<number, Persona>;
  /** Los sectores de cada persona (por sus puestos). */
  sectoresDe: Map<string, Set<string>>;
  /** Los sectores donde trabaja tareas: los de sus puestos que no son de dirección (la dirección supervisa). */
  ejecutaEn: Map<string, Set<string>>;
};

export function armarContexto(data: EquipoData): Contexto {
  const puestos = new Map(data.puestos.map((p) => [p.id, p]));
  return {
    data,
    porId: new Map(data.personas.map((p) => [p.id, p])),
    porBc: new Map(data.personas.filter((p) => p.bc_persona_id != null).map((p) => [p.bc_persona_id!, p])),
    sectoresDe: new Map(data.personas.map((p) => [p.id, new Set(p.puestos.flatMap((id) => puestos.get(id)?.sectores ?? []))])),
    ejecutaEn: new Map(
      data.personas.map((p) => [
        p.id,
        new Set(p.puestos.flatMap((id) => (puestos.get(id) && puestos.get(id)!.nivel !== "direccion" ? puestos.get(id)!.sectores : []))),
      ])
    ),
  };
}

/** Puede tener tareas de ese sector: una de Redacción la toma otro de Redacción (no la dirección, que supervisa). */
export const ejecutaSector = (ctx: Contexto, personaId: string, sector: string) => ctx.ejecutaEn.get(personaId)?.has(sector) ?? false;

/** El designado de una marca en un sector. */
export function designadoDe(ctx: Contexto, brandId: string | null, sector: string) {
  if (!brandId) return null;
  const d = ctx.data.designaciones.find((x) => x.brand_id === brandId && x.sector_id === sector);
  return d ? (ctx.porId.get(d.persona_id) ?? null) : null;
}

/**
 * Quién tiene la tarea en su etapa actual: la que la tomó (o a quien se la pasaron); si no, el
 * designado de la marca para ese sector; si no hay, el único asignado en Basecamp que es de ese sector.
 */
export function responsableDe(t: TareaFlujo, ctx: Contexto): Responsable {
  const sector = sectorDeEtapa(etapaDe(t), t.tablero, ctx.data);
  if (!sector) return { persona: null, origen: null, sector: null };
  if (t.responsable_id) return { persona: ctx.porId.get(t.responsable_id) ?? null, origen: "tomada", sector };
  const designado = designadoDe(ctx, t.brand_id, sector);
  if (designado) return { persona: designado, origen: "designado", sector };
  const candidatos = t.asignados.map((id) => ctx.porBc.get(id)).filter((p): p is Persona => Boolean(p && ejecutaSector(ctx, p.id, sector)));
  return candidatos.length === 1 ? { persona: candidatos[0], origen: "basecamp", sector } : { persona: null, origen: null, sector };
}

/**
 * Quiénes validan una tarea: los compañeros relacionados con ella. Redacción, Cuentas y CM de la marca
 * (designados o asignados en Basecamp) y la dirección (el director del hub de la marca, o quien tenga
 * un puesto de dirección y esté asignado).
 */
export function validadoresDe(t: TareaFlujo, ctx: Contexto): Persona[] {
  const set = new Map<string, Persona>();
  for (const sector of ["redaccion", "cuentas", "cm"]) {
    const d = designadoDe(ctx, t.brand_id, sector);
    if (d) set.set(d.id, d);
  }
  const hub = t.brand_id ? ctx.data.hubs.find((h) => h.marcas.includes(t.brand_id!)) : null;
  const lider = hub?.lider_id ? ctx.porId.get(hub.lider_id) : null;
  if (lider) set.set(lider.id, lider);
  const direccion = new Set(ctx.data.puestos.filter((p) => p.nivel === "direccion").map((p) => p.id));
  for (const id of t.asignados) {
    const p = ctx.porBc.get(id);
    if (!p) continue;
    const s = ctx.sectoresDe.get(p.id);
    if (s && (s.has("redaccion") || s.has("cuentas") || s.has("cm") || p.puestos.some((x) => direccion.has(x)))) set.set(p.id, p);
  }
  return [...set.values()];
}

/** Tareas vivas para el Board: sin terminar, o terminadas que todavía no vencieron (después se archivan). */
export function visible(t: TareaFlujo, hoy = new Date().toISOString().slice(0, 10)) {
  const e = etapaDe(t);
  if (e !== "finalizada") return !t.completada;
  return Boolean(t.vigencia && t.vigencia >= hoy);
}

/* ───────────── Base ───────────── */

const COLUMNAS =
  "id, titulo, app_url, vence, completada, asignados, comentarios, creada, actualizada, proyecto_id, proyecto, brand_id, columna_id, columna, estado, tablero_id, tablero, etapa, responsable_id, orden, pausada, pausa_motivo, vigente_hasta, vigente_origen, vigencia";

async function hacer(q: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export const flujoRepo = {
  /** Crea el flujo de las tareas nuevas y sigue a Basecamp en las que se movieron allá. */
  reconciliar: () => hacer(supabase.rpc("flujo_reconciliar")),

  /** Todas las tareas vivas (y las terminadas que todavía no vencieron), de todos los tableros. */
  async todas(): Promise<TareaFlujo[]> {
    const hoy = new Date().toISOString().slice(0, 10);
    const filas: TareaFlujo[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase
        .from("board_flujo")
        .select(COLUMNAS)
        .or(`completada.eq.false,vigencia.gte.${hoy}`)
        .order("id")
        .range(desde, desde + 999);
      if (error) throw new Error(error.message);
      const pagina = (data ?? []) as unknown as TareaFlujo[];
      filas.push(...pagina);
      if (pagina.length < 1000) break;
    }
    return filas
      .map((t) => ({ ...t, asignados: (t.asignados ?? []).map(Number), orden: t.orden == null ? null : Number(t.orden) }))
      .filter((t) => visible(t, hoy));
  },

  async movimientos(tareaId: number) {
    const { data, error } = await supabase
      .from("tarea_movimientos")
      .select("id, tarea_id, tipo, de, a, nota, autor_id, origen, creado")
      .eq("tarea_id", tareaId)
      .order("creado", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as Movimiento[];
  },

  /**
   * Quiénes validaron cada tarea desde la última vez que entró a Validación (si vuelve a Diseño y
   * después a Validación, se valida de nuevo).
   */
  async validaciones(ids: number[]) {
    const resultado = new Map<number, Set<string>>();
    if (!ids.length) return resultado;
    const { data, error } = await supabase
      .from("tarea_movimientos")
      .select("tarea_id, tipo, a, autor_id, creado")
      .in("tarea_id", ids)
      .in("tipo", ["validacion", "etapa"])
      .order("creado", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);
    for (const m of (data ?? []) as Pick<Movimiento, "tarea_id" | "tipo" | "a" | "autor_id">[]) {
      const id = Number(m.tarea_id);
      if (m.tipo === "etapa" && m.a === "validacion") resultado.set(id, new Set());
      else if (m.tipo === "validacion" && m.autor_id) {
        if (!resultado.has(id)) resultado.set(id, new Set());
        resultado.get(id)!.add(m.autor_id);
      }
    }
    return resultado;
  },

  async brief(tareaId: number) {
    const { data, error } = await supabase.from("bc_tareas").select("contenido").eq("id", tareaId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.contenido as string | null) ?? null;
  },

  mover: (id: number, etapa: Etapa, orden?: number | null, nota?: string) =>
    hacer(supabase.rpc("tarea_mover", { p_tarea: id, p_etapa: etapa, p_orden: orden ?? null, p_nota: nota ?? null })),
  ordenar: (id: number, orden: number) => hacer(supabase.rpc("tarea_ordenar", { p_tarea: id, p_orden: orden })),
  asignar: (id: number, persona: string | null, orden?: number | null) =>
    hacer(supabase.rpc("tarea_asignar", { p_tarea: id, p_persona: persona, p_orden: orden ?? null })),
  pausar: (id: number, pausada: boolean, motivo?: string) =>
    hacer(supabase.rpc("tarea_pausar", { p_tarea: id, p_pausada: pausada, p_motivo: motivo ?? null })),
  vigencia: (id: number, fecha: string | null) =>
    hacer(supabase.rpc("tarea_vigencia", { p_tarea: id, p_fecha: fecha, p_origen: "manual", p_nota: null })),
  validar: (id: number, nota?: string) => hacer(supabase.rpc("tarea_validar", { p_tarea: id, p_nota: nota ?? null })),

  /** La IA lee el título y el brief y pone hasta cuándo vale el trabajo. Solo cambia esa fecha. */
  async vigenciaIA(id: number): Promise<{ fecha: string; motivo: string }> {
    const r = await fetch("/api/board/vigencia-ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tarea_id: id }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error ?? `Error ${r.status}`);
    return body;
  },
};

/** Falta correr supabase/migracion-flujo.sql. */
export const faltaMigracionFlujo = (message: string) => /board_flujo|tarea_flujo|flujo_reconciliar|tarea_movimientos/i.test(message);

export function flujoErrorMessage(message: string) {
  if (/no trabaja tareas de ese sector/i.test(message)) return "Esa persona no trabaja tareas de ese sector (la dirección supervisa, no las toma).";
  if (/no se asigna a una persona/i.test(message)) return "En esta etapa la tarea no es de una persona.";
  if (/etapa_check/i.test(message)) return "Esa etapa no existe.";
  if (/estar en el equipo/i.test(message)) return "Para validar tenés que estar en el equipo (pedile a un admin que te sume).";
  if (/Iniciá sesión/i.test(message)) return "Iniciá sesión con tu cuenta del estudio.";
  return message;
}
