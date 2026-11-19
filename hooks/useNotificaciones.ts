"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { toast } from "@/components/ui/toaster";
import { hasSupabase, supabase } from "@/lib/supabase";
import { agrupar, contador, MOTIVO_LABEL, type Grupo, type Notificacion } from "@/lib/notificaciones/prioridad";

/** Cuántos días para atrás se muestran (la base las guarda 45). */
const DIAS = 21;
/** Cada cuánto se vuelve a mirar con la pestaña a la vista (los avisos de Basecamp llegan al instante a la base). */
const CADA_MS = 60_000;

type State = {
  lista: Notificacion[];
  loaded: boolean;
  /** Falta correr supabase/migracion-notificaciones.sql: la campanita no se muestra. */
  sinMigracion: boolean;
  error: string | null;
};

let state: State = { lista: [], loaded: false, sinMigracion: false, error: null };
const SERVER = state;
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Las urgentes que ya se avisaron con un toast (para no repetirlas en cada vuelta). */
const avisadas = new Set<number>();
let cargando: Promise<void> | null = null;

export function refreshNotificaciones() {
  cargando ??= (async () => {
    try {
      const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("mis_notificaciones")
        .select("*")
        .gte("creada", desde)
        .order("creada", { ascending: false })
        .limit(400);
      if (error) {
        const sinMigracion = /mis_notificaciones|does not exist|schema cache|42P01/i.test(error.message);
        set({ loaded: true, sinMigracion, error: sinMigracion ? null : error.message });
        return;
      }
      const lista = ((data ?? []) as Notificacion[]).map((n) => ({
        ...n,
        id: Number(n.id),
        hilo_id: n.hilo_id == null ? null : Number(n.hilo_id),
        tarea_id: n.tarea_id == null ? null : Number(n.tarea_id),
        proyecto_id: n.proyecto_id == null ? null : Number(n.proyecto_id),
      }));
      avisarUrgentes(lista, state.loaded);
      set({ lista, loaded: true, sinMigracion: false, error: null });
    } catch (e) {
      set({ loaded: true, error: (e as Error).message });
    } finally {
      cargando = null;
    }
  })();
  return cargando;
}

/**
 * Un toast solo para lo que no puede esperar (te nombraron, te asignaron, algo tuyo urgente) y solo
 * si llegó mientras la app estaba abierta: al entrar no se repite lo de antes.
 */
function avisarUrgentes(lista: Notificacion[], yaHabiaCargado: boolean) {
  const urgentes = agrupar(lista).filter((g) => g.nivel === "ahora");
  for (const g of urgentes) {
    const nuevas = g.idsNoLeidas.filter((id) => !avisadas.has(id));
    nuevas.forEach((id) => avisadas.add(id));
    if (yaHabiaCargado && nuevas.length) {
      toast(`${MOTIVO_LABEL[g.motivo]}: ${g.ultima.titulo ?? g.ultima.proyecto ?? "Basecamp"}`);
    }
  }
}

/** Marca como leídas al toque (sin esperar a la base) y lo guarda. */
export async function marcarLeidas(ids: number[]) {
  const pendientes = new Set(ids.filter((id) => state.lista.some((n) => n.id === id && !n.leida)));
  if (!pendientes.size) return;
  const ahora = new Date().toISOString();
  set({ lista: state.lista.map((n) => (pendientes.has(n.id) ? { ...n, leida: ahora } : n)) });
  const { error } = await supabase.from("notificaciones").update({ leida: ahora }).in("id", [...pendientes]).is("leida", null);
  if (error) {
    toast(`No se pudieron marcar como leídas: ${error.message}`, "error");
    refreshNotificaciones();
  }
}

/** Solo el estado (sin cargar ni refrescar): para saber desde otro lado si la campanita está. */
export function useEstadoNotificaciones() {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

export function useNotificaciones({ activo = true } = {}) {
  const snap = useSyncExternalStore(subscribe, () => state, () => SERVER);

  useEffect(() => {
    if (!activo || !hasSupabase) return;
    refreshNotificaciones();
    const tick = () => {
      if (document.visibilityState === "visible") refreshNotificaciones();
    };
    const timer = window.setInterval(tick, CADA_MS);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [activo]);

  const grupos: Grupo[] = useMemo(() => agrupar(snap.lista), [snap.lista]);
  return { ...snap, grupos, contador: contador(grupos), refresh: refreshNotificaciones };
}
