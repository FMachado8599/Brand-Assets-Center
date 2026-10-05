"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_SIZE, type EmojiEntry, type EmojiPage } from "@/lib/emojis/types";

export type EmojiSource =
  | { kind: "group"; group: number; subgroup: number | null; total: number }
  | { kind: "search"; q: string }
  | { kind: "ids"; ids: string[] };

type State = {
  key: string;
  items: EmojiEntry[];
  /** Fin acumulado de cada página recibida: el esqueleto se resuelve página por página. */
  batches: number[];
  total: number | null;
  nextCursor: number | null;
  loading: boolean;
  error: string | null;
  mode?: EmojiPage["mode"];
};

const initial = (key: string): State => ({
  key,
  items: [],
  batches: [],
  total: null,
  nextCursor: 0,
  loading: key !== "",
  error: null,
});

function urlFor(source: EmojiSource, cursor: number) {
  switch (source.kind) {
    case "group":
      return `/api/emojis?group=${source.group}${source.subgroup !== null ? `&subgroup=${source.subgroup}` : ""}&cursor=${cursor}&limit=${PAGE_SIZE}`;
    case "search":
      return `/api/emojis/search?q=${encodeURIComponent(source.q)}&cursor=${cursor}&limit=${PAGE_SIZE}`;
    case "ids":
      return `/api/emojis?ids=${source.ids.slice(cursor, cursor + PAGE_SIZE).join(",")}`;
  }
}

/**
 * Emojis de a páginas desde /api/emojis: nunca se piden todos juntos.
 * La primera página llega sola; las siguientes, con loadMore ("Cargar más").
 */
export function usePagedEmojis(source: EmojiSource | null) {
  const key = source ? JSON.stringify(source) : "";
  const [state, setState] = useState<State>(() => initial(key));
  const controller = useRef<AbortController | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const fetchPage = useCallback(async (src: EmojiSource, srcKey: string, cursor: number) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setState((prev) => ({ ...(prev.key === srcKey ? prev : initial(srcKey)), loading: true, error: null }));

    try {
      const res = await fetch(urlFor(src, cursor), { signal: ctrl.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) throw new Error(body?.error ?? `Error ${res.status}`);
      const page = body as EmojiPage;
      const isIds = src.kind === "ids";
      const nextCursor = isIds ? (cursor + PAGE_SIZE < src.ids.length ? cursor + PAGE_SIZE : null) : page.nextCursor;

      setState((prev) => {
        if (prev.key !== srcKey) return prev;
        const items = [...prev.items, ...page.emojis];
        return {
          ...prev,
          items,
          batches: [...prev.batches, items.length],
          total: isIds ? src.ids.length : page.total,
          nextCursor,
          loading: false,
          mode: page.mode ?? prev.mode,
        };
      });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setState((prev) =>
        prev.key === srcKey ? { ...prev, loading: false, error: e instanceof Error ? e.message : "Algo falló" } : prev
      );
    }
  }, []);

  useEffect(() => {
    const src = sourceRef.current;
    setState(initial(key));
    if (src) fetchPage(src, key, 0);
    return () => controller.current?.abort();
  }, [key, fetchPage]);

  const current = state.key === key ? state : initial(key);

  const loadMore = useCallback(() => {
    const src = sourceRef.current;
    if (src && !current.loading && current.nextCursor !== null) fetchPage(src, key, current.nextCursor);
  }, [fetchPage, key, current.loading, current.nextCursor]);

  const retry = useCallback(() => {
    const src = sourceRef.current;
    if (src) fetchPage(src, key, current.items.length ? current.nextCursor ?? 0 : 0);
  }, [fetchPage, key, current.items.length, current.nextCursor]);

  // Cuántos emojis trae la página que está en camino, si ya se sabe: son los esqueletos a mostrar.
  const known =
    current.total ??
    (source?.kind === "group" ? source.total : source?.kind === "ids" ? source.ids.length : null);
  const pending = current.loading && known !== null ? Math.max(0, Math.min(PAGE_SIZE, known - current.items.length)) : 0;

  return {
    ...current,
    total: known,
    pending,
    /** Primera página de una búsqueda en camino: todavía no se sabe cuántos resultados hay. */
    searching: current.loading && known === null,
    loadMore,
    retry,
  };
}
