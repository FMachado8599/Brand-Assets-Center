"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * El modo foco: un pomodoro (25 minutos de trabajo y 5 de pausa, o lo que se elija) que sigue
 * corriendo al cambiar de herramienta y al recargar. Se guarda en este navegador (no en la cuenta:
 * es de esta compu y de este rato).
 */

export type Fase = "foco" | "pausa";

export type Foco = {
  fase: Fase;
  /** Cuándo termina (ms). */
  fin: number;
  /** Lo que dura la fase (min), para la barra de progreso. */
  minutos: number;
  /** En pausa (el botón): cuánto le faltaba (ms). */
  pausado: number | null;
  /** Cuántos focos van seguidos. */
  vueltas: number;
};

const KEY = "inicio:foco";
const listeners = new Set<() => void>();
let state: Foco | null = null;
let leido = false;

function leer() {
  if (leido || typeof window === "undefined") return;
  leido = true;
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Foco) : null;
    // Uno que terminó hace más de una hora ya no sirve.
    state = v && typeof v.fin === "number" && (v.pausado != null || v.fin > Date.now() - 3_600_000) ? v : null;
  } catch {
    state = null;
  }
}

function set(next: Foco | null) {
  state = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function empezarFoco(minutos = 25, fase: Fase = "foco") {
  const vueltas = fase === "foco" ? (state?.vueltas ?? 0) + 1 : Math.max(1, state?.vueltas ?? 1);
  set({ fase, minutos, fin: Date.now() + minutos * 60_000, pausado: null, vueltas });
}

export function pausarFoco() {
  if (!state || state.pausado != null) return;
  set({ ...state, pausado: Math.max(0, state.fin - Date.now()) });
}

export function seguirFoco() {
  if (!state || state.pausado == null) return;
  set({ ...state, fin: Date.now() + state.pausado, pausado: null });
}

export const terminarFoco = () => set(null);

export function useFoco() {
  const foco = useSyncExternalStore(
    subscribe,
    () => {
      leer();
      return state;
    },
    () => null
  );
  // Un tic por segundo mientras corre, para la cuenta regresiva.
  const [, setTic] = useState(0);
  const corriendo = Boolean(foco && foco.pausado == null);
  useEffect(() => {
    if (!corriendo) return;
    const id = window.setInterval(() => setTic((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [corriendo]);
  const restante = foco ? Math.max(0, foco.pausado ?? foco.fin - Date.now()) : 0;
  return { foco, restante, terminado: Boolean(foco && foco.pausado == null && restante === 0) };
}

/** "24:59". */
export function reloj(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Un "ding" corto con el navegador (sin archivos de sonido). */
export function sonarCampana() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1600);
  } catch {
    /* sin audio */
  }
}
