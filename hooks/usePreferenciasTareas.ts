"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { hasSupabase, supabase } from "@/lib/supabase";

/**
 * Lo que cada uno elige de cada tarea (supabase/migracion-notificaciones.sql, tarea_preferencias):
 * - avisos "citas": de esa tarea solo llega lo que es para vos (te nombraron o te la pasaron);
 * - oculta: sale de tu tablero y tampoco avisa, salvo lo mismo.
 * La clave es la card de Basecamp (o la conversación): el hilo_id de las notificaciones.
 */
export type Avisos = "todo" | "citas";
export type PreferenciaTarea = { avisos: Avisos; oculta: boolean };

const NORMAL: PreferenciaTarea = { avisos: "todo", oculta: false };

type State = { porTarea: Map<number, PreferenciaTarea>; loaded: boolean };

let state: State = { porTarea: new Map(), loaded: false };
const SERVER: State = state;
const listeners = new Set<() => void>();
let started = false;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export async function refreshPreferencias() {
  started = true;
  if (!hasSupabase) return set({ loaded: true });
  const { data, error } = await supabase.from("tarea_preferencias").select("tarea_id, avisos, oculta");
  if (error) return set({ loaded: true });
  set({
    porTarea: new Map((data ?? []).map((p) => [Number(p.tarea_id), { avisos: p.avisos as Avisos, oculta: Boolean(p.oculta) }])),
    loaded: true,
  });
}

function guardarLocal(tarea: number, p: PreferenciaTarea) {
  const porTarea = new Map(state.porTarea);
  if (p.avisos === "todo" && !p.oculta) porTarea.delete(tarea);
  else porTarea.set(tarea, p);
  set({ porTarea });
}

export const preferenciaDe = (tarea: number) => state.porTarea.get(tarea) ?? NORMAL;

/** Cambia la preferencia de una tarea (lo que no se pasa no cambia). Si falla, vuelve a como estaba. */
export async function ponerPreferencia(tarea: number, cambio: Partial<PreferenciaTarea>) {
  const antes = preferenciaDe(tarea);
  guardarLocal(tarea, { ...antes, ...cambio });
  const { error } = await supabase.rpc("tarea_preferencia", {
    p_tarea: tarea,
    p_avisos: cambio.avisos ?? null,
    p_oculta: cambio.oculta ?? null,
  });
  if (error) {
    guardarLocal(tarea, antes);
    throw new Error(error.message);
  }
}

export function usePreferenciasTareas() {
  const snap = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(() => {
    if (!started) refreshPreferencias();
  }, []);
  return useMemo(() => {
    const ocultas = new Set([...snap.porTarea].filter(([, p]) => p.oculta).map(([id]) => id));
    return {
      loaded: snap.loaded,
      ocultas,
      de: (tarea: number) => snap.porTarea.get(tarea) ?? NORMAL,
    };
  }, [snap]);
}
