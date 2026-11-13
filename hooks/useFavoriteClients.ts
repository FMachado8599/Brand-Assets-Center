"use client";

import { useCallback, useMemo } from "react";
import { useStoredState } from "@/hooks/useStoredState";

/**
 * Los clientes favoritos de cada uno: van primero, aparte, en Clientes. Son personales (no del
 * estudio): se guardan en el navegador y, con sesión, en la cuenta, como los favoritos de Emojis.
 */
export function useFavoriteClients() {
  const [ids, setIds, loaded] = useStoredState<string[]>("clientes:favoritos", []);
  const set = useMemo(() => new Set(ids), [ids]);

  const toggle = useCallback(
    (id: string) => setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [setIds]
  );

  return { has: (id: string) => set.has(id), toggle, loaded };
}
