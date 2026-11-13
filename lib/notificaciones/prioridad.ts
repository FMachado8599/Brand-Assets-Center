import { tonoDe, type Etapa, type Tono } from "@/lib/board/flujo";

/**
 * Cómo se ordenan las notificaciones: lo que es para vos y urgente, siempre arriba. Veinte
 * comentarios de algo que no es tuyo nunca tapan una mención o una tarea tuya que vence hoy.
 *
 * 1. Se agrupan por conversación (una card, un mensaje…): "5 comentarios nuevos" es una fila.
 * 2. Cada grupo va a un nivel, según su motivo más fuerte sin leer y lo urgente de la tarea:
 *      ahora  → te nombraron, te asignaron, o hay novedades en algo tuyo que está vencido o vence hoy/mañana
 *      tuyas  → novedades en tus tareas y conversaciones
 *      marcas → algo de tus marcas que no es tuyo (solo en "Todo")
 *      leidas → lo ya visto
 * 3. Dentro de cada nivel, un puntaje: el motivo (mención 5, asignación 4, tu tarea 3, tu conversación 2,
 *    tu marca 1) más lo urgente de la tarea (vencida +4, vence hoy o mañana +2). Así lo vencido va
 *    primero, después las menciones y lo que vence pronto, después las asignaciones; a igual puntaje,
 *    lo más nuevo arriba.
 */

export type Motivo = "mencion" | "asignacion" | "tuya" | "hilo" | "marca";

/** El evento con el que la campanita le pide al Board que abra una tarea (si ya se está en /board). */
export const ABRIR_TAREA = "board:abrir-tarea";

/** Una fila de la vista mis_notificaciones (supabase/migracion-notificaciones.sql). */
export type Notificacion = {
  id: number;
  origen: "basecamp" | "app";
  motivo: Motivo;
  hilo_id: number | null;
  tarea_id: number | null;
  proyecto_id: number | null;
  creada: string;
  leida: string | null;
  kind: string | null;
  titulo: string | null;
  texto: string | null;
  autor: string | null;
  autor_avatar: string | null;
  app_url: string | null;
  proyecto: string | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_color: string | null;
  brand_logo_url: string | null;
  brand_logo_bg: string | null;
  brand_logo_from: string | null;
  // La tarea del Board, si la conversación es una card (para saber qué tan urgente es).
  vence: string | null;
  vigencia: string | null;
  completada: boolean | null;
  etapa: string | null;
  estado: string | null;
  columna: string | null;
  tablero: string | null;
  pausada: boolean | null;
};

export type Nivel = "ahora" | "tuyas" | "marcas" | "leidas";
export type Filtro = "para-mi" | "menciones" | "todo";
export type Orden = "prioridad" | "recientes";

export type Grupo = {
  clave: string;
  nivel: Nivel;
  /** El motivo más fuerte (entre las sin leer; si están todas leídas, entre todas). */
  motivo: Motivo;
  /** Qué tan urgente es la tarea (null si no es una card del Board). */
  tono: Tono | null;
  urgente: boolean;
  /** La más nueva del grupo (de ahí sale la fecha). */
  ultima: Notificacion;
  /** La que se muestra y se abre: la más nueva con el motivo más fuerte (ej: la mención, no la respuesta de después). */
  principal: Notificacion;
  noLeidas: number;
  /** Ids para marcar como leídas. */
  ids: number[];
  idsNoLeidas: number[];
  /** Quiénes escribieron, del más nuevo al más viejo. */
  autores: string[];
  menciones: number;
  fecha: string;
};

export const RANGO: Record<Motivo, number> = { mencion: 5, asignacion: 4, tuya: 3, hilo: 2, marca: 1 };

export const MOTIVO_LABEL: Record<Motivo, string> = {
  mencion: "Te nombraron",
  asignacion: "Te la asignaron",
  tuya: "Tu tarea",
  hilo: "Tu conversación",
  marca: "Tu marca",
};

export const NIVEL_LABEL: Record<Nivel, string> = {
  ahora: "Para vos, ahora",
  tuyas: "Tus tareas y conversaciones",
  marcas: "En tus marcas",
  leidas: "Anteriores",
};

const URGENCIA: Partial<Record<Tono, number>> = { vencida: 4, pronto: 2 };

/** El puntaje de un grupo para ordenar por prioridad (ver arriba). */
export const puntaje = (g: Pick<Grupo, "motivo" | "tono">) => RANGO[g.motivo] + (URGENCIA[g.tono ?? "nueva"] ?? 0);

/** Qué tan urgente es la tarea de la notificación. null si no es una card (un mensaje, un to-do…). */
export function tonoDeNotificacion(n: Notificacion, hoy = new Date()): Tono | null {
  if (n.tarea_id == null || (n.etapa == null && n.estado == null && n.vence == null && n.completada == null)) return null;
  return tonoDe(
    {
      // La base solo guarda etapas válidas (tarea_flujo tiene un check).
      etapa: (n.etapa as Etapa | null) ?? null,
      estado: n.estado,
      columna: n.columna,
      tablero: n.tablero,
      completada: Boolean(n.completada),
      pausada: Boolean(n.pausada),
      vence: n.vence,
    },
    hoy
  );
}

const fuerte = (lista: Notificacion[]) => lista.reduce<Motivo>((m, n) => (RANGO[n.motivo] > RANGO[m] ? n.motivo : m), lista[0].motivo);

function nivelDe(motivo: Motivo, noLeidas: number, urgente: boolean): Nivel {
  if (!noLeidas) return "leidas";
  if (motivo === "mencion" || motivo === "asignacion") return "ahora";
  if (motivo === "marca") return "marcas";
  return urgente ? "ahora" : "tuyas";
}

/** Una conversación: el hilo de Basecamp, o la tarea (lo del Board y lo de Basecamp de la misma card van juntos). */
const claveDe = (n: Notificacion) => (n.hilo_id ?? n.tarea_id) != null ? `h${n.hilo_id ?? n.tarea_id}` : `n${n.id}`;

export function agrupar(lista: Notificacion[], hoy = new Date()): Grupo[] {
  const porClave = new Map<string, Notificacion[]>();
  for (const n of lista) {
    const k = claveDe(n);
    const g = porClave.get(k);
    if (g) g.push(n);
    else porClave.set(k, [n]);
  }
  return [...porClave].map(([clave, items]) => {
    const orden = [...items].sort((a, b) => b.creada.localeCompare(a.creada));
    const sinLeer = orden.filter((n) => !n.leida);
    const motivo = fuerte(sinLeer.length ? sinLeer : orden);
    const ultima = orden[0];
    const principal = (sinLeer.length ? sinLeer : orden).find((n) => n.motivo === motivo) ?? ultima;
    // La urgencia es de la tarea: cualquiera del grupo que la traiga (las del Board y las de Basecamp son la misma card).
    const tono = tonoDeNotificacion(orden.find((n) => n.tarea_id != null) ?? ultima, hoy);
    const urgente = tono != null && (URGENCIA[tono] ?? 0) > 0;
    return {
      clave,
      nivel: nivelDe(motivo, sinLeer.length, urgente),
      motivo,
      tono,
      urgente,
      ultima,
      principal,
      noLeidas: sinLeer.length,
      ids: orden.map((n) => n.id),
      idsNoLeidas: sinLeer.map((n) => n.id),
      autores: [...new Set(orden.map((n) => n.autor).filter((a): a is string => Boolean(a)))],
      menciones: orden.filter((n) => n.motivo === "mencion").length,
      fecha: ultima.creada,
    };
  });
}

const NIVELES: Nivel[] = ["ahora", "tuyas", "marcas", "leidas"];

/** Lo que entra en cada filtro. "Para mí" deja afuera lo de tus marcas que no es tuyo. */
export function pasaFiltro(g: Grupo, filtro: Filtro) {
  if (filtro === "menciones") return g.menciones > 0;
  if (filtro === "para-mi") return g.nivel !== "marcas" && !(g.nivel === "leidas" && g.motivo === "marca");
  return true;
}

export function comparar(a: Grupo, b: Grupo, orden: Orden) {
  if (orden === "prioridad") {
    const p = puntaje(b) - puntaje(a);
    if (p) return p;
  }
  return b.fecha.localeCompare(a.fecha);
}

/**
 * Las secciones a mostrar. Por prioridad: un nivel por sección, en orden. Por recientes: las sin
 * leer juntas (de la más nueva a la más vieja) y después las leídas.
 */
export function secciones(grupos: Grupo[], filtro: Filtro, orden: Orden): { nivel: Nivel | "nuevas"; grupos: Grupo[] }[] {
  const visibles = grupos.filter((g) => pasaFiltro(g, filtro));
  if (orden === "recientes") {
    const nuevas = visibles.filter((g) => g.nivel !== "leidas").sort((a, b) => comparar(a, b, orden));
    const leidas = visibles.filter((g) => g.nivel === "leidas").sort((a, b) => comparar(a, b, orden));
    return [
      { nivel: "nuevas" as const, grupos: nuevas },
      { nivel: "leidas" as const, grupos: leidas },
    ].filter((s) => s.grupos.length);
  }
  return NIVELES.map((nivel) => ({ nivel, grupos: visibles.filter((g) => g.nivel === nivel).sort((a, b) => comparar(a, b, orden)) })).filter(
    (s) => s.grupos.length
  );
}

/** El número de la campanita: lo sin leer que es para vos (lo de tus marcas no suma). */
export function contador(grupos: Grupo[]) {
  const paraVos = grupos.filter((g) => g.nivel === "ahora" || g.nivel === "tuyas");
  return { total: paraVos.length, urgentes: paraVos.filter((g) => g.nivel === "ahora").length };
}
