"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

/** Columnas según el ancho disponible (no el de la ventana): así anda igual dentro de un panel chico. */
const columnsFor = (width: number) => (width < 480 ? 2 : width < 768 ? 3 : width < 1100 ? 4 : 5);

/**
 * Grilla tipo Pinterest para cosas de distinto alto (GIFs). Cada ítem va a la columna más corta, en orden:
 * al sumar una página nueva, los que ya estaban no se mueven (con `columns` de CSS saltarían de columna).
 * `ratio` es alto / ancho de cada ítem.
 */
export function Masonry<T>({ items, ratio, render }: { items: T[]; ratio: (item: T) => number; render: (item: T) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(4);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setCount(columnsFor(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columns = useMemo(() => {
    const out: T[][] = Array.from({ length: count }, () => []);
    const heights = new Array(count).fill(0);
    for (const item of items) {
      const k = heights.indexOf(Math.min(...heights));
      out[k].push(item);
      heights[k] += ratio(item) || 1;
    }
    return out;
  }, [items, count, ratio]);

  return (
    <div ref={ref} className="flex items-start gap-2.5 sm:gap-3">
      {columns.map((col, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-2.5 sm:gap-3">
          {col.map(render)}
        </div>
      ))}
    </div>
  );
}
