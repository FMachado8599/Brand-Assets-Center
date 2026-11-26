"use client";

import { useState } from "react";
import { PLATFORM_NAMES, PlatformIcon } from "@/components/downloads/PlatformIcon";
import type { Platform } from "@/lib/downloads/types";
import { cn } from "@/lib/utils";

/** El color de las barras: ocre de la marca, validado contra la tarjeta (luminosidad, saturación y 3:1). */
export const BAR_COLOR = "#b07a00";

export type Bucket = {
  key: string;
  /** "lunes 20 de octubre", "semana del 6 de octubre" (tooltip y tabla). */
  label: string;
  /** "20 oct" (eje). */
  short: string;
  total: number;
  porPlataforma: Record<Platform, number>;
};

const PLATFORMS: Platform[] = ["youtube", "instagram", "pinterest"];

/** 0, 5, 10… con 3 o 4 líneas: pasos redondos (1, 2 o 5 por potencia de 10). */
function ticksFor(max: number) {
  const raw = Math.max(1, max) / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return ticks;
}

const count = (n: number) => `${n.toLocaleString("es-AR")} ${n === 1 ? "descarga" : "descargas"}`;

function describe(b: Bucket) {
  const parts = PLATFORMS.filter((p) => b.porPlataforma[p]).map((p) => `${PLATFORM_NAMES[p]} ${b.porPlataforma[p]}`);
  return `${b.label}: ${count(b.total)}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

/** Columnas por día (o por semana): una sola serie, así que no lleva leyenda. Cada columna tiene su tooltip. */
export function DailyChart({ buckets }: { buckets: Bucket[] }) {
  const [active, setActive] = useState<number | null>(null);
  const ticks = ticksFor(Math.max(0, ...buckets.map((b) => b.total)));
  const top = ticks[ticks.length - 1];
  const n = buckets.length;
  // En el eje, pocas fechas: todas si son pocas; si no, la primera, la del medio y la última.
  const axis = n <= 8 ? buckets.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  const current = active !== null ? buckets[active] : null;
  const position = active !== null ? (active + 0.5) / n : 0;

  return (
    <div className="relative pl-9">
      <div className="relative h-52">
        {ticks.map((t) => (
          <div key={t} aria-hidden className="absolute inset-x-0 border-t border-border" style={{ bottom: `${(t / top) * 100}%` }}>
            <span className="absolute -left-9 w-7 -translate-y-1/2 text-right text-[10px] tabular-nums text-muted-foreground">
              {t.toLocaleString("es-AR")}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {buckets.map((b, i) => (
            <button
              key={b.key}
              type="button"
              aria-label={describe(b)}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive((a) => (a === i ? null : a))}
              onFocus={() => setActive(i)}
              onBlur={() => setActive((a) => (a === i ? null : a))}
              className="flex h-full min-w-0 flex-1 items-end justify-center rounded-sm outline-none focus-visible:bg-foreground/5"
            >
              <span
                className={cn("block w-full max-w-6 rounded-t-[4px] transition-opacity", active !== null && active !== i && "opacity-60")}
                style={{ height: `${(b.total / top) * 100}%`, minHeight: b.total ? 2 : 0, background: BAR_COLOR }}
              />
            </button>
          ))}
        </div>

        {current && (
          <div
            role="presentation"
            className={cn(
              "pointer-events-none absolute z-10 min-w-40 rounded-xl border bg-popover px-3 py-2 text-xs shadow-md",
              position < 0.2 ? "translate-x-0" : position > 0.8 ? "-translate-x-full" : "-translate-x-1/2"
            )}
            // Justo arriba de la columna.
            style={{ left: `${position * 100}%`, bottom: `calc(${(current.total / top) * 100}% + 8px)` }}
          >
            <p className="text-sm font-semibold">{count(current.total)}</p>
            <p className="text-muted-foreground">{current.label}</p>
            {current.total > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {PLATFORMS.filter((p) => current.porPlataforma[p]).map((p) => (
                  <li key={p} className="flex items-center gap-1.5">
                    <PlatformIcon platform={p} className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium tabular-nums">{current.porPlataforma[p]}</span>
                    <span className="text-muted-foreground">{PLATFORM_NAMES[p]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div aria-hidden className="relative mt-1.5 h-4 text-[10px] text-muted-foreground">
        {axis.map((i) => (
          <span
            key={buckets[i].key}
            className={cn("absolute whitespace-nowrap", i === 0 ? "" : i === n - 1 ? "-translate-x-full" : "-translate-x-1/2")}
            style={{ left: i === 0 ? 0 : i === n - 1 ? "100%" : `${((i + 0.5) / n) * 100}%` }}
          >
            {buckets[i].short}
          </span>
        ))}
      </div>
    </div>
  );
}

/** La misma información en una tabla (la vista accesible del gráfico). Lo más nuevo arriba. */
export function DailyTable({ buckets }: { buckets: Bucket[] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-secondary text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Fecha</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            {PLATFORMS.map((p) => (
              <th key={p} className="px-3 py-2 text-right font-medium">
                {PLATFORM_NAMES[p]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {[...buckets].reverse().map((b) => (
            <tr key={b.key}>
              <td className="px-3 py-1.5 first-letter:uppercase">{b.label}</td>
              <td className="px-3 py-1.5 text-right font-medium tabular-nums">{b.total}</td>
              {PLATFORMS.map((p) => (
                <td key={p} className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {b.porPlataforma[p] || "–"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
