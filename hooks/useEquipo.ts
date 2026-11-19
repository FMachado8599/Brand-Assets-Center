"use client";

import { useEffect, useSyncExternalStore } from "react";
import { toast } from "@/components/ui/toaster";
import { cargarEquipo, equipoErrorMessage, faltaMigracionEquipo, type EquipoData } from "@/lib/board/equipo";

type State = { data: EquipoData | null; error: string | null; sinMigracion: boolean; loaded: boolean };

/**
 * El equipo, una sola lectura para todo el Board (Mis tareas, Equipo): vive fuera de React, así no
 * se vuelve a pedir al pasar de una pestaña a la otra.
 */
let state: State = { data: null, error: null, sinMigracion: false, loaded: false };
const SERVER: State = state;
const listeners = new Set<() => void>();
let started = false;
let seq = 0;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export async function refreshEquipo() {
  started = true;
  const mine = ++seq;
  try {
    const data = await cargarEquipo();
    if (mine === seq) set({ data, error: null, sinMigracion: false, loaded: true });
  } catch (e) {
    const message = (e as Error).message;
    if (mine === seq) set({ error: message, sinMigracion: faltaMigracionEquipo(message), loaded: true });
  }
}

/** Corre un cambio y vuelve a leer; si falla, avisa con el motivo en palabras de la app. */
export async function cambiarEquipo(accion: () => Promise<unknown>, ok?: string) {
  try {
    await accion();
    if (ok) toast(ok);
    return true;
  } catch (e) {
    toast(equipoErrorMessage((e as Error).message), "error");
    return false;
  } finally {
    await refreshEquipo();
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useEquipo() {
  const snap = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(() => {
    if (!started) refreshEquipo();
  }, []);
  return { ...snap, admin: Boolean(snap.data?.yo?.admin), refresh: refreshEquipo };
}
