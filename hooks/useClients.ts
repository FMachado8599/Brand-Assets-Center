"use client";

import { useEffect, useSyncExternalStore } from "react";
import { cleanPalette } from "@/lib/clients/color";
import type { Brand } from "@/lib/types";

const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** El repositorio se carga recién cuando hace falta: Emojis, GIF y Conversor no pagan el peso de Supabase. */
const loadRepo = () => import("@/lib/repos/brands").then((m) => m.brandsRepo);

type State = {
  clients: Brand[];
  loaded: boolean;
  /** La base ya tiene la ficha (migracion-clientes.sql). null: no se sabe (no hay clientes para mirar). */
  hasProfile: boolean | null;
};

/**
 * La lista de clientes, una sola para toda la app: Tarjetas, Redacción,
 * Clientes y el diálogo de "Nuevo cliente" leen y escriben la misma. Vive
 * fuera de React, así sobrevive al pasar de un módulo a otro y un cliente
 * creado desde cualquier lado aparece en todos al instante.
 */
let state: State = { clients: [], loaded: !hasSupabase, hasProfile: null };
const SERVER: State = { clients: [], loaded: false, hasProfile: null };
const listeners = new Set<() => void>();
let started = false;
/** Solo cuenta la respuesta del último pedido: una lectura vieja no pisa a una más nueva. */
let seq = 0;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

const byName = (a: Brand, b: Brand) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });

/** Normaliza lo que viene de la base (la paleta es jsonb: puede venir cualquier cosa). */
function tidy(brand: Brand): Brand {
  return {
    ...brand,
    logo_bg: brand.logo_bg === "dark" || brand.logo_bg === "brand" ? brand.logo_bg : "light",
    palette: cleanPalette(brand.palette),
    font_families: Array.isArray(brand.font_families) ? brand.font_families : [],
    notes: brand.notes ?? "",
  };
}

/** Vuelve a leer los clientes. Devuelve el error, si hubo, para quien quiera mostrarlo. */
export async function refreshClients() {
  started = true;
  if (!hasSupabase) {
    set({ loaded: true });
    return { error: null };
  }
  const mine = ++seq;
  const repo = await loadRepo();
  const { data, error } = await repo.list();
  if (mine === seq) {
    if (error) console.warn("[clientes] no se pudieron leer:", error.message);
    if (data) {
      const rows = data as Brand[];
      set({ clients: rows.map(tidy), loaded: true, hasProfile: rows.length ? "palette" in rows[0] : null });
    } else set({ loaded: true });
  }
  return { error };
}

/** Agrega o actualiza uno sin volver a leer todo (después de crearlo o editarlo). */
export function rememberClient(brand: Brand) {
  const next = state.clients.filter((c) => c.id !== brand.id);
  next.push(tidy(brand));
  set({ clients: next.sort(byName) });
}

/** El cliente tal como está ahora (no el de la última vez que se pintó): para editar sin pisar un cambio recién hecho. */
export const getClient = (id: string) => state.clients.find((c) => c.id === id) ?? null;

export function forgetClient(id: string) {
  set({ clients: state.clients.filter((c) => c.id !== id) });
}

/** Busca uno por nombre, sin importar mayúsculas ni acentos (para no crear "Changan" dos veces). */
export function findClientByName(name: string) {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const key = fold(name);
  return state.clients.find((c) => fold(c.name) === key) ?? null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useClients() {
  const snap = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(() => {
    if (!started) refreshClients();
  }, []);
  return { clients: snap.clients, loading: !snap.loaded, hasProfile: snap.hasProfile, refresh: refreshClients };
}
