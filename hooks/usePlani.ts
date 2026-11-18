"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/toaster";
import { piezaNueva, planiErrorMessage, planiRepo, type CambioEstado } from "@/lib/plani/repo";
import type { Formato, Pieza, PiezaPatch, Plani, PlaniEstado, PlaniPatch } from "@/lib/plani/types";

const SAVE_DELAY = 700;

const ordenar = (a: Pieza, b: Pieza) =>
  a.fecha.localeCompare(b.fecha) || a.orden - b.orden || a.created_at.localeCompare(b.created_at);

export type GuardadoEstado = "idle" | "saving" | "error";

/**
 * Una plani abierta: sus datos y sus piezas. Los cambios se ven al instante y se guardan atrás;
 * lo que se escribe seguido (copys, indicaciones) se junta en un solo pedido por pieza. Al volver
 * a la pestaña se relee, por si otro rol cambió algo (diseño subió material, CM programó).
 */
export function usePlani(id: string) {
  const [plani, setPlani] = useState<Plani | null>(null);
  const [piezas, setPiezas] = useState<Pieza[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<GuardadoEstado>("idle");

  const pending = useRef(new Map<string, PiezaPatch>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inflight = useRef(0);

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setLoading(true);
      const [p, ps] = await Promise.all([planiRepo.get(id), planiRepo.piezas(id)]);
      if (p.error || ps.error) {
        if (!silencioso) setError(planiErrorMessage((p.error ?? ps.error)!));
      } else {
        setError(null);
        setPlani(p.data ?? null);
        // Lo que se está escribiendo ahora no se pisa con lo que vino de la base.
        const local = pending.current;
        setPiezas(((ps.data ?? []) as Pieza[]).map((x) => (local.has(x.id) ? { ...x, ...local.get(x.id) } : x)).sort(ordenar));
      }
      if (!silencioso) setLoading(false);
    },
    [id]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const onFocus = () => {
      if (!pending.current.size && !inflight.current) cargar(true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [cargar]);

  const empezar = () => {
    inflight.current++;
    setGuardado("saving");
  };
  const terminar = (ok: boolean) => {
    inflight.current--;
    if (!ok) setGuardado("error");
    else if (!inflight.current) setGuardado("idle");
  };

  const flush = useCallback(
    async (piezaId: string) => {
      clearTimeout(timers.current.get(piezaId));
      timers.current.delete(piezaId);
      const patch = pending.current.get(piezaId);
      pending.current.delete(piezaId);
      if (!patch || !Object.keys(patch).length) return;
      empezar();
      const { error } = await planiRepo.updatePieza(piezaId, patch);
      terminar(!error);
      if (error) {
        toast(planiErrorMessage(error), "error");
        cargar(true);
      }
    },
    [cargar]
  );

  const flushAll = useCallback(() => {
    [...pending.current.keys()].forEach((k) => flush(k));
  }, [flush]);

  useEffect(() => {
    window.addEventListener("pagehide", flushAll);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      flushAll();
    };
  }, [flushAll]);

  /** Cambia una pieza. `ahora`: se guarda ya (un toggle, un archivo); si no, después de una pausa al escribir. */
  const updatePieza = useCallback(
    (piezaId: string, patch: PiezaPatch, ahora = false) => {
      setPiezas((prev) => {
        const next = prev.map((p) => (p.id === piezaId ? { ...p, ...patch } : p));
        return "fecha" in patch || "orden" in patch ? next.sort(ordenar) : next;
      });
      pending.current.set(piezaId, { ...(pending.current.get(piezaId) ?? {}), ...patch });
      clearTimeout(timers.current.get(piezaId));
      if (ahora) flush(piezaId);
      else timers.current.set(piezaId, setTimeout(() => flush(piezaId), SAVE_DELAY));
    },
    [flush]
  );

  const addPieza = useCallback(
    async (fecha: string, formato: Formato, extra: Partial<Pieza> = {}) => {
      const orden = piezas.filter((p) => p.fecha === fecha).reduce((max, p) => Math.max(max, p.orden + 1), 0);
      empezar();
      const { data, error } = await planiRepo.createPieza(piezaNueva(id, fecha, formato, { orden, ...extra }));
      terminar(!error);
      if (error || !data) {
        toast(planiErrorMessage(error ?? { message: "No se pudo crear" }), "error");
        return null;
      }
      setPiezas((prev) => [...prev, data].sort(ordenar));
      return data;
    },
    [id, piezas]
  );

  const removePieza = useCallback(
    async (piezaId: string) => {
      clearTimeout(timers.current.get(piezaId));
      pending.current.delete(piezaId);
      const antes = piezas;
      setPiezas((prev) => prev.filter((p) => p.id !== piezaId));
      empezar();
      const { error } = await planiRepo.removePieza(piezaId);
      terminar(!error);
      if (error) {
        toast(planiErrorMessage(error), "error");
        setPiezas(antes);
        return false;
      }
      return true;
    },
    [piezas]
  );

  /** Una copia de la pieza el mismo día, sin el material final (es otra pieza: otro diseño). */
  const duplicarPieza = useCallback(
    async (piezaId: string) => {
      const p = piezas.find((x) => x.id === piezaId);
      if (!p) return null;
      return addPieza(p.fecha, p.formato, {
        proporcion: p.proporcion,
        plataformas: p.plataformas,
        titulo: p.titulo ? `${p.titulo} (copia)` : "",
        copys: p.copys,
        instrucciones: p.instrucciones,
        slides: p.slides,
        referencias: p.referencias,
        assets: p.assets,
      });
    },
    [piezas, addPieza]
  );

  const updatePlani = useCallback(
    async (patch: PlaniPatch) => {
      setPlani((prev) => (prev ? { ...prev, ...patch } : prev));
      empezar();
      const { error } = await planiRepo.update(id, patch);
      terminar(!error);
      if (error) {
        toast(planiErrorMessage(error), "error");
        cargar(true);
        return false;
      }
      return true;
    },
    [id, cargar]
  );

  /**
   * Pasa la presentación a otra etapa (ej: "Redacción lista" → Diseño). Si tiene tarea, también
   * la mueve en el Board. Devuelve lo que pasó con la tarea, o null si falló.
   */
  const cambiarEstado = useCallback(
    async (estado: PlaniEstado): Promise<CambioEstado | null> => {
      const antes = plani?.estado;
      setPlani((prev) => (prev ? { ...prev, estado } : prev));
      empezar();
      const { data, error } = await planiRepo.cambiarEstado(id, estado);
      terminar(!error);
      if (error) {
        toast(planiErrorMessage(error), "error");
        if (antes) setPlani((prev) => (prev ? { ...prev, estado: antes } : prev));
        return null;
      }
      return (data as CambioEstado | null) ?? { estado, tarea: null, etapa: null, avisados: 0 };
    },
    [id, plani?.estado]
  );

  /** Las piezas agrupadas por día, en orden. */
  const dias = useMemo(() => {
    const map = new Map<string, Pieza[]>();
    for (const p of piezas) map.set(p.fecha, [...(map.get(p.fecha) ?? []), p]);
    return [...map.entries()].map(([fecha, items]) => ({ fecha, piezas: items }));
  }, [piezas]);

  return {
    plani,
    piezas,
    dias,
    loading,
    error,
    guardado,
    recargar: () => cargar(true),
    updatePieza,
    addPieza,
    removePieza,
    duplicarPieza,
    updatePlani,
    cambiarEstado,
    flushAll,
  };
}

export type PlaniStore = ReturnType<typeof usePlani>;
