"use client";

import { useEffect, useState } from "react";

/**
 * El valor, pero recién cuando dejó de cambiar por `delay` ms (para no pedir
 * una búsqueda por tecla). El segundo valor lo fija ya, sin esperar.
 */
export function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return [debounced, setDebounced] as const;
}
