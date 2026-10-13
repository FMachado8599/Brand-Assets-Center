"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toaster";

/** El cliente de Supabase se carga recién cuando hace falta: Inicio no paga su peso al abrir. */
const loadClient = () => import("@/lib/supabase").then((m) => m.supabase);

export type SuggestionKind = "idea" | "error";
export type SuggestionStatus = "abierta" | "en_camino" | "hecha";

/** Un post-it del tablero, tal como lo devuelve tablero_sugerencias() (migracion-sugerencias.sql). */
export type Suggestion = {
  id: string;
  kind: SuggestionKind;
  body: string;
  status: SuggestionStatus;
  created_at: string;
  /** null: anónima. */
  author_name: string | null;
  author_avatar: string | null;
  votos: number;
  /** Te sumaste vos. */
  votada: boolean;
  /** La mandaste vos: la podés borrar. */
  mine: boolean;
  /** Administrás el tablero: cambiás el estado y borrás cualquiera. */
  can_manage: boolean;
};

const message = (error: unknown) =>
  error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "Algo falló";

/**
 * El tablero de sugerencias del estudio: leerlo, sumarse, cambiar el estado y
 * borrar. Los cambios se ven al instante y, si la base dice que no, vuelven atrás.
 */
export function useSuggestionBoard(enabled: boolean) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [failed, setFailed] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const reload = useCallback(async () => {
    const supabase = await loadClient();
    const { data, error } = await supabase.rpc("tablero_sugerencias");
    if (error) {
      console.warn("[sugerencias] no se pudo leer el tablero:", error.message);
      setFailed(true);
    } else {
      setItems((data ?? []).map((s: Suggestion) => ({ ...s, votos: Number(s.votos) })));
      setFailed(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    reload();
    // Al volver a la pestaña se ve lo que mandaron los demás mientras tanto.
    const onFocus = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [enabled, reload]);

  const patch = (id: string, change: Partial<Suggestion>) =>
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, ...change } : s)));

  const vote = useCallback(async (id: string) => {
    const before = itemsRef.current.find((s) => s.id === id);
    if (!before) return;
    patch(id, { votada: !before.votada, votos: before.votos + (before.votada ? -1 : 1) });
    const supabase = await loadClient();
    const { error } = await supabase.rpc("alternar_voto_sugerencia", { p_id: id });
    if (error) {
      patch(id, { votada: before.votada, votos: before.votos });
      toast(message(error), "error");
    }
  }, []);

  const setStatus = useCallback(async (id: string, status: SuggestionStatus) => {
    const before = itemsRef.current.find((s) => s.id === id);
    if (!before) return;
    patch(id, { status });
    const supabase = await loadClient();
    const { error } = await supabase.rpc("estado_sugerencia", { p_id: id, p_status: status });
    if (error) {
      patch(id, { status: before.status });
      toast(message(error), "error");
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    const supabase = await loadClient();
    const { error } = await supabase.rpc("borrar_sugerencia", { p_id: id });
    if (error) {
      toast(message(error), "error");
      return false;
    }
    setItems((prev) => prev.filter((s) => s.id !== id));
    return true;
  }, []);

  return { items, loading, failed, reload, vote, setStatus, remove };
}
