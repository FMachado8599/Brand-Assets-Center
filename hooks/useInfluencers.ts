"use client";

import { useEffect, useSyncExternalStore } from "react";
import { toast } from "@/components/ui/toaster";
import { cargarInfluencers, type InfluencersData } from "@/lib/influencity/datos";
import { faltaMigracionInfluencers } from "@/lib/influencity/tipos";

type State = { data: InfluencersData | null; error: string | null; sinMigracion: boolean; loaded: boolean };

/**
 * Influencers, campañas, rendimiento y vínculos: una sola lectura para todo el módulo (y para la
 * ficha del cliente). Vive fuera de React, así no se vuelve a pedir al pasar de una pestaña a otra.
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

export async function refreshInfluencers() {
  started = true;
  const mine = ++seq;
  try {
    const data = await cargarInfluencers();
    if (mine === seq) set({ data, error: null, sinMigracion: false, loaded: true });
  } catch (e) {
    const message = (e as Error).message;
    if (mine === seq) set({ error: message, sinMigracion: faltaMigracionInfluencers(message), loaded: true });
  }
}

/** Corre un cambio y vuelve a leer; si falla, avisa con el motivo. */
export async function cambiarInfluencers(accion: () => Promise<unknown>, ok?: string) {
  try {
    await accion();
    if (ok) toast(ok);
    return true;
  } catch (e) {
    toast((e as Error).message, "error");
    return false;
  } finally {
    await refreshInfluencers();
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useInfluencers() {
  const snap = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(() => {
    if (!started) refreshInfluencers();
  }, []);
  return { ...snap, refresh: refreshInfluencers };
}

/** POST a una ruta de /api/influencity; tira el error que devuelva, en palabras de la app. */
export async function pedirInfluencity<T = Record<string, unknown>>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const r = await fetch(`/api/influencity${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(res.error ?? `Error ${r.status}`);
  return res as T;
}
