"use client";

import { useEffect, useSyncExternalStore } from "react";

/** Cómo está Slack, tal como lo devuelve /api/slack (sin token). */
export type SlackEstado = {
  listo: { slack: boolean; secreto: boolean; cron: boolean };
  conexion: {
    team_id: string | null;
    team_nombre: string | null;
    dominio: string | null;
    conectada_por: string | null;
    conectada: string;
    canal_estudio: { id: string; nombre: string } | null;
  } | null;
  yo: { equipo_id: string | null; slack_id: string | null; slack_nombre: string | null };
  canales: { brand_id: string; canal_id: string; canal_nombre: string; avisos: boolean; creado_por: string | null; updated_at: string }[];
  /** Solo para admins. */
  vinculos?: { persona_id: string; slack_id: string; slack_nombre: string | null }[];
};

type State = { data: SlackEstado | null; error: string | null; sinMigracion: boolean; loaded: boolean };

/** Una sola lectura para toda la app (la usan el Board, el Perfil, Clientes y Saludar). */
let state: State = { data: null, error: null, sinMigracion: false, loaded: false };
const SERVER: State = state;
const listeners = new Set<() => void>();
let started = false;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export async function refreshSlack() {
  started = true;
  try {
    const r = await fetch("/api/slack", { cache: "no-store" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) set({ error: body.error ?? `Error ${r.status}`, sinMigracion: Boolean(body.sinMigracion), loaded: true });
    else set({ data: body as SlackEstado, error: null, sinMigracion: false, loaded: true });
  } catch (e) {
    set({ error: (e as Error).message, loaded: true });
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useSlack() {
  const snap = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(() => {
    if (!started) refreshSlack();
  }, []);
  return { ...snap, conectado: Boolean(snap.data?.conexion), refresh: refreshSlack };
}

/** Un pedido a la API de Slack de la app: devuelve el cuerpo o tira con el mensaje del servidor. */
export async function pedirSlack<T = Record<string, unknown>>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(url, {
    method: init.method ?? "POST",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `Error ${r.status}`);
  return body as T;
}

/** El link que abre el privado con alguien en la app de Slack (la de escritorio o la del celular). */
export function linkPrivado(teamId: string | null | undefined, slackId: string) {
  return teamId ? `slack://user?team=${encodeURIComponent(teamId)}&id=${encodeURIComponent(slackId)}` : null;
}
