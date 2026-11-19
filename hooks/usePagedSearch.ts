"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SearchPage<T> = { items: T[]; total: number; next: number | null };

type State<T> = SearchPage<T> & { loading: boolean; error: string | null };

/**
 * Una búsqueda que se pide de a páginas (GIFs, íconos…). `key` identifica la búsqueda: cuando cambia se
 * cancela la anterior y se empieza de cero desde `first`. `load` trae la página que empieza en `cursor`
 * (un offset o un número de página, según la API). Los repetidos entre páginas se descartan.
 *
 * Pensado para reusar: cualquier herramienta que quiera un buscador de GIFs o de íconos usa esto con
 * fetchGifs / fetchIcons y arma su propia vista.
 */
export function usePagedSearch<T extends { id: string | number }>(
  key: string | null,
  first: number,
  load: (cursor: number, signal: AbortSignal) => Promise<SearchPage<T>>
) {
  const [state, setState] = useState<State<T>>({ items: [], total: 0, next: null, loading: key !== null, error: null });
  const loadRef = useRef(load);
  loadRef.current = load;
  const controller = useRef<AbortController | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;

  const run = useCallback(async (cursor: number, append: boolean) => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const forKey = keyRef.current;
    setState((s) => ({ ...s, loading: true, error: null, ...(append ? {} : { items: [], total: 0, next: null }) }));
    try {
      const page = await loadRef.current(cursor, c.signal);
      if (c.signal.aborted || keyRef.current !== forKey) return;
      setState((s) => {
        const base = append ? s.items : [];
        const seen = new Set(base.map((i) => i.id));
        return { items: [...base, ...page.items.filter((i) => !seen.has(i.id))], total: page.total, next: page.next, loading: false, error: null };
      });
    } catch (e) {
      if (c.signal.aborted) return;
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Algo falló" }));
    }
  }, []);

  useEffect(() => {
    if (key === null) return;
    run(first, false);
    return () => controller.current?.abort();
  }, [key, first, run]);

  const loadMore = useCallback(() => {
    if (state.next !== null && !state.loading) run(state.next, true);
  }, [state.next, state.loading, run]);

  const retry = useCallback(() => {
    if (state.items.length && state.next !== null) run(state.next, true);
    else run(first, false);
  }, [state.items.length, state.next, first, run]);

  return { ...state, loadMore, retry };
}

/** GET a una ruta nuestra que contesta JSON, con el error que mande el servidor. */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Error ${res.status}`);
  return body as T;
}
