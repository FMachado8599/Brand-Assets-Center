"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { toast } from "@/components/ui/toaster";
import { refreshInfluencers } from "@/hooks/useInfluencers";
import type { Cuotas } from "@/lib/influencity/tipos";

type Paso = "trackings" | "publicaciones" | "perfiles" | "cierre" | "listo";

export type EstadoInfluencity = {
  listo: { secreto: boolean };
  conexion: {
    conectada_por: string | null;
    conectada: string;
    datos: { final?: string; tracking?: boolean; perfiles?: boolean };
  } | null;
  sync: {
    ultimo: string | null;
    ultimo_error: string | null;
    corriendo_desde: string | null;
    cuotas: Cuotas | null;
    resumen: {
      completa?: boolean;
      trackings?: number;
      publicaciones?: number;
      perfiles?: number;
      perfilesSinDatos?: number;
      asignadas?: number;
      requests?: number;
      sinTracking?: boolean;
      sinPerfiles?: boolean;
    } | null;
  } | null;
};

type State = {
  data: EstadoInfluencity | null;
  error: string | null;
  sinMigracion: boolean;
  loaded: boolean;
  corriendo: boolean;
  paso: Paso | null;
  detalle: string;
};

const NOMBRES: Record<Paso, string> = {
  trackings: "Campañas",
  publicaciones: "Publicaciones",
  perfiles: "Perfiles",
  cierre: "Clientes y cuotas",
  listo: "Listo",
};

/** Cada cuánto se sincroniza sola al abrir Influencers (las métricas de Influencity cambian despacio). */
const AUTO_MS = 3 * 3_600_000;

let state: State = { data: null, error: null, sinMigracion: false, loaded: false, corriendo: false, paso: null, detalle: "" };
const SERVER: State = state;
const listeners = new Set<() => void>();
let started = false;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Cómo está la conexión (sin el token) y la última sincronización. */
export async function refreshInfluencity() {
  started = true;
  try {
    const r = await fetch("/api/influencity", { cache: "no-store" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) set({ error: body.error ?? `Error ${r.status}`, sinMigracion: Boolean(body.sinMigracion), loaded: true });
    else set({ data: body as EstadoInfluencity, error: null, sinMigracion: false, loaded: true });
  } catch (e) {
    set({ error: (e as Error).message, loaded: true });
  }
}

/** Corre la sincronización entera, paso por paso (ver lib/influencity/sync.ts). */
export async function sincronizarInfluencity({ silencioso = false, completa = false } = {}) {
  if (state.corriendo) return;
  set({ corriendo: true, paso: "trackings", detalle: "" });
  let paso: Paso = "trackings";
  try {
    for (let vuelta = 0; vuelta < 400 && paso !== "listo"; vuelta++) {
      const r = await fetch("/api/influencity/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paso === "trackings" ? { paso, completa } : { paso }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (body.ocupado) {
          if (!silencioso) toast(body.error, "error");
          break;
        }
        throw new Error(body.error ?? `Error ${r.status}`);
      }
      paso = body.siguiente as Paso;
      set({ paso, detalle: body.detalle ?? "" });
      // Las publicaciones se ven aparecer mientras se traen.
      if (body.paso === "publicaciones" && vuelta % 3 === 0) refreshInfluencers();
    }
    if (paso === "listo" && !silencioso) toast("Influencity al día");
  } catch (e) {
    if (!silencioso) toast(`Influencity: ${(e as Error).message}`, "error");
  } finally {
    set({ corriendo: false, paso: null, detalle: "" });
    refreshInfluencity();
    refreshInfluencers();
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useInfluencity({ auto = false } = {}) {
  const snap = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(() => {
    if (!started) refreshInfluencity();
  }, []);

  const conectada = Boolean(snap.data?.conexion);
  const ultimo = snap.data?.sync?.ultimo ?? null;
  const desde = snap.data?.sync?.corriendo_desde;
  const ocupadoPorOtro = desde ? Date.now() - new Date(desde).getTime() < 120_000 : false;

  useEffect(() => {
    if (!auto || !conectada || state.corriendo || ocupadoPorOtro) return;
    if (!ultimo || Date.now() - new Date(ultimo).getTime() > AUTO_MS) sincronizarInfluencity({ silencioso: true });
  }, [auto, conectada, ultimo, ocupadoPorOtro]);

  const sincronizar = useCallback(() => sincronizarInfluencity(), []);
  const sincronizarTodo = useCallback(() => sincronizarInfluencity({ completa: true }), []);
  return {
    ...snap,
    conectada,
    pasoNombre: snap.paso ? NOMBRES[snap.paso] : null,
    cuotas: snap.data?.sync?.cuotas ?? null,
    sincronizar,
    sincronizarTodo,
    refresh: refreshInfluencity,
  };
}
