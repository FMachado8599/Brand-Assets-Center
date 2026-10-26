"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { toast } from "@/components/ui/toaster";
import { refreshClients } from "@/hooks/useClients";
import { refreshIntegraciones, useIntegraciones } from "@/hooks/useIntegraciones";

type Paso = "personas" | "proyectos" | "miembros" | "tareas" | "columnas" | "actividad" | "listo";

type State = { corriendo: boolean; paso: Paso | null; detalle: string; error: string | null };

const NOMBRES: Record<Paso, string> = {
  personas: "Gente",
  proyectos: "Proyectos y clientes",
  miembros: "Gente por proyecto",
  tareas: "Tareas",
  columnas: "Tableros",
  actividad: "Actividad del equipo",
  listo: "Listo",
};

/** Cada cuánto se sincroniza sola al abrir Clientes o Planificación. */
const AUTO_MS = 30 * 60_000;

let state: State = { corriendo: false, paso: null, detalle: "", error: null };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Corre la sincronización entera, paso por paso (ver lib/integraciones/basecamp-sync.ts).
 * `completa` trae todas las tareas, no solo lo que cambió desde la última vez.
 */
export async function sincronizarBasecamp({ silencioso = false, completa = false } = {}) {
  if (state.corriendo) return;
  set({ corriendo: true, paso: "personas", detalle: "", error: null });
  let paso: Paso = "personas";
  let nuevos: string[] = [];
  let cambiosEquipo: { desactivados: string[]; reactivados: string[] } | null = null;
  try {
    for (let vuelta = 0; vuelta < 80 && paso !== "listo"; vuelta++) {
      const r = await fetch("/api/basecamp/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paso === "personas" ? { paso, completa } : { paso }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (body.ocupado) {
          if (!silencioso) toast(body.error, "error");
          break;
        }
        throw new Error(body.error ?? `Error ${r.status}`);
      }
      if (body.paso === "proyectos") nuevos = body.resumen?.clientesNuevos ?? [];
      if (body.paso === "actividad" && body.siguiente === "listo") cambiosEquipo = body.resumen?.actividad ?? null;
      paso = body.siguiente as Paso;
      set({ paso, detalle: body.detalle ?? "" });
    }
    if (paso === "listo") {
      if (nuevos.length) {
        await refreshClients();
        toast(
          nuevos.length === 1
            ? `Nuevo cliente desde Basecamp: ${nuevos[0]}`
            : `${nuevos.length} clientes nuevos desde Basecamp: ${nuevos.slice(0, 4).join(", ")}${nuevos.length > 4 ? "…" : ""}`
        );
      } else if (!silencioso) toast("Basecamp al día");
      const lista = (nombres: string[]) => `${nombres.slice(0, 4).join(", ")}${nombres.length > 4 ? "…" : ""}`;
      if (cambiosEquipo?.desactivados.length) toast(`Sin actividad en 30 días, quedaron inactivos: ${lista(cambiosEquipo.desactivados)}`);
      if (cambiosEquipo?.reactivados.length) toast(`Volvieron a tener actividad: ${lista(cambiosEquipo.reactivados)}`);
    }
  } catch (e) {
    set({ error: (e as Error).message });
    if (!silencioso) toast(`Basecamp: ${(e as Error).message}`, "error");
  } finally {
    set({ corriendo: false, paso: null });
    refreshIntegraciones();
  }
}

export function useBasecampSync({ auto = false } = {}) {
  const snap = useSyncExternalStore(subscribe, () => state, () => state);
  const { basecampOk, data } = useIntegraciones();
  const ultimo = data?.sync?.ultimo ?? null;
  const ocupadoPorOtro = data?.sync?.corriendo_desde ? Date.now() - new Date(data.sync.corriendo_desde).getTime() < 120_000 : false;

  useEffect(() => {
    if (!auto || !basecampOk || state.corriendo || ocupadoPorOtro) return;
    if (!ultimo || Date.now() - new Date(ultimo).getTime() > AUTO_MS) sincronizarBasecamp({ silencioso: true });
  }, [auto, basecampOk, ultimo, ocupadoPorOtro]);

  const sincronizar = useCallback(() => sincronizarBasecamp(), []);
  const sincronizarTodo = useCallback(() => sincronizarBasecamp({ completa: true }), []);
  return { ...snap, pasoNombre: snap.paso ? NOMBRES[snap.paso] : null, sincronizar, sincronizarTodo, ultimo, basecampOk };
}
