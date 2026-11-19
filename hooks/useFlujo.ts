"use client";

import { useEffect, useSyncExternalStore } from "react";
import { toast } from "@/components/ui/toaster";
import { faltaMigracionFlujo, flujoErrorMessage, flujoRepo, type TareaFlujo } from "@/lib/board/flujo";

type State = { tareas: TareaFlujo[]; loaded: boolean; error: string | null; sinMigracion: boolean };

/**
 * Las tareas del Board (de todos los tableros), una sola lectura para Tablero y Mis tareas. Los
 * cambios se ven al instante (se aplican acá antes de que conteste la base); si la base dice que no,
 * se vuelve a leer todo y se avisa por qué.
 */
let state: State = { tareas: [], loaded: false, error: null, sinMigracion: false };
const SERVER: State = state;
const listeners = new Set<() => void>();
let started = false;
let seq = 0;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export async function refreshFlujo({ reconciliar = false } = {}) {
  started = true;
  const mine = ++seq;
  try {
    // Al abrir el Board: crear el flujo de las tareas nuevas y seguir lo que se movió en Basecamp.
    if (reconciliar) await flujoRepo.reconciliar();
    const tareas = await flujoRepo.todas();
    if (mine === seq) set({ tareas, loaded: true, error: null, sinMigracion: false });
  } catch (e) {
    const message = (e as Error).message;
    if (mine === seq) set({ loaded: true, error: message, sinMigracion: faltaMigracionFlujo(message) });
  }
}

/** Cambia una tarea en pantalla y la guarda; si falla, vuelve atrás y avisa. */
export async function cambiarTarea(id: number, local: Partial<TareaFlujo>, guardar: () => Promise<unknown>, ok?: string) {
  set({ tareas: state.tareas.map((t) => (t.id === id ? { ...t, ...local } : t)) });
  try {
    await guardar();
    if (ok) toast(ok);
    return true;
  } catch (e) {
    toast(flujoErrorMessage((e as Error).message), "error");
    await refreshFlujo();
    return false;
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useFlujo() {
  const snap = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(() => {
    if (!started) refreshFlujo({ reconciliar: true });
  }, []);
  return { ...snap, refresh: refreshFlujo };
}
