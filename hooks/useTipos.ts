"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { planiErrorMessage } from "@/lib/plani/repo";
import { tipoDesconocido, tiposRepo, type TipoPresentacion } from "@/lib/plani/tipos";

type State = { tipos: TipoPresentacion[]; error: string | null; loaded: boolean };

/** Los tipos de presentación: una sola lectura para toda la app (son pocos y casi no cambian). */
let state: State = { tipos: [], error: null, loaded: false };
const SERVER: State = state;
const listeners = new Set<() => void>();
let started = false;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export async function refreshTipos() {
  started = true;
  const { data, error } = await tiposRepo.list();
  if (error) set({ error: planiErrorMessage(error), loaded: true });
  else set({ tipos: data ?? [], error: null, loaded: true });
}

/** Suma un tipo recién creado sin volver a leer todo. */
export function agregarTipo(tipo: TipoPresentacion) {
  set({ tipos: [...state.tipos.filter((t) => t.id !== tipo.id), tipo].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es")) });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useTipos() {
  const snap = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(() => {
    if (!started) refreshTipos();
  }, []);
  const porId = useMemo(() => new Map(snap.tipos.map((t) => [t.id, t])), [snap.tipos]);
  /** El tipo de una presentación; si no está (se borró o todavía carga), uno neutro con su id. */
  const tipoDe = useMemo(() => (id: string) => porId.get(id) ?? tipoDesconocido(id), [porId]);
  return { ...snap, porId, tipoDe };
}
