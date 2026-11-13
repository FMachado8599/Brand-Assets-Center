"use client";

import { useEffect, useSyncExternalStore } from "react";
// Solo tipos (se borran al compilar): el cliente no carga nada del servidor.
import type { BasecampDatos } from "@/lib/integraciones/basecamp";
import type { SyncResumen } from "@/lib/integraciones/basecamp-sync";

/** La fila de bc_sync, tal como la devuelve /api/integraciones. */
export type SyncInfo = {
  ultimo: string | null;
  ultimo_error: string | null;
  corriendo_desde: string | null;
  tareas_hasta: string | null;
  resumen: SyncResumen | null;
};

export type Integraciones = {
  listo: { secreto: boolean; basecamp: boolean; google: boolean };
  basecamp: { cuenta_id: string | null; cuenta_nombre: string | null; conectada_por: string | null; conectada: string; datos: BasecampDatos } | null;
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
