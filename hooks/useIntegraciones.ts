"use client";

import { useEffect, useSyncExternalStore } from "react";

export type SyncInfo = {
  ultimo: string | null;
  ultimo_error: string | null;
  corriendo_desde: string | null;
  tareas_hasta: string | null;
  resumen: {
    personas?: number;
    proyectos?: number;
    clientesNuevos?: string[];
    vinculados?: string[];
    miembros?: number | null;
    tareas?: number;
    columnas?: number;
    completa?: boolean;
    requests?: number;
  } | null;
};

export type Integraciones = {
  listo: { secreto: boolean; basecamp: boolean; google: boolean };
  basecamp: { cuenta_id: string | null; cuenta_nombre: string | null; conectada_por: string | null; conectada: string; datos: Record<string, unknown> } | null;
  google: { cuenta_id: string | null; cuenta_nombre: string | null; conectada_por: string | null; conectada: string; datos: { raiz_url?: string | null } } | null;
  sync: SyncInfo | null;
};

type State = { data: Integraciones | null; error: string | null; sinMigracion: boolean; loaded: boolean };

/**
 * Cómo están las conexiones con Basecamp y Drive: una sola lectura para toda la app (la usan
 * Clientes, Planificación y el subidor de material).
 */
let state: State = { data: null, error: null, sinMigracion: false, loaded: false };
const SERVER: State = state;
const listeners = new Set<() => void>();
let started = false;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export async function refreshIntegraciones() {
  started = true;
  try {
    const r = await fetch("/api/integraciones", { cache: "no-store" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) set({ error: body.error ?? `Error ${r.status}`, sinMigracion: Boolean(body.sinMigracion), loaded: true });
    else set({ data: body as Integraciones, error: null, sinMigracion: false, loaded: true });
  } catch (e) {
    set({ error: (e as Error).message, loaded: true });
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useIntegraciones() {
  const snap = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(() => {
    if (!started) refreshIntegraciones();
  }, []);
  return {
    ...snap,
    driveOk: Boolean(snap.data?.google),
    basecampOk: Boolean(snap.data?.basecamp),
    refresh: refreshIntegraciones,
  };
}

/** A dónde mandar para conectar, volviendo a la pantalla actual. */
export function conectarUrl(proveedor: "basecamp" | "google") {
  const volver = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
  return `/api/integraciones/${proveedor}/conectar?volver=${encodeURIComponent(volver)}`;
}
