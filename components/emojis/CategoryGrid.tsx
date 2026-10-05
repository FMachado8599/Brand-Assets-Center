"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useImageReveal } from "@/hooks/useImageReveal";
import { imageUrl, type CategorySummary } from "@/lib/emojis/types";

/**
 * Las categorías del inicio, cada una con su primer emoji como portada. Se
 * muestran todas juntas cuando cargaron las portadas.
 */
export function CategoryGrid({
  categories,
  onSelect,
}: {
  categories: CategorySummary[];
  onSelect: (category: CategorySummary) => void;
}) {
  const urls = useMemo(() => categories.map((c) => imageUrl(c.cover.i)), [categories]);
  const batches = useMemo(() => [urls.length], [urls]);
  const ready = useImageReveal(urls, batches, "batch", "categorias") >= urls.length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {categories.map((c, i) =>
        ready ? (
          <button
            key={c.key}
            type="button"
            onClick={() => onSelect(c)}
            className="group flex items-center gap-2.5 rounded-3xl border bg-card/90 p-2.5 text-left shadow-sm transition duration-200 animate-in fade-in-0 zoom-in-95 hover:-translate-y-0.5 hover:shadow-md sm:gap-3 sm:p-3"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary/70 transition-colors group-hover:bg-primary/25 sm:h-14 sm:w-14">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(c.cover.i)} alt="" className="h-8 w-8 transition-transform group-hover:scale-110 sm:h-10 sm:w-10" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-tight">{c.name}</span>
              <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">{c.count} emojis</span>
            </span>
            <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
          </button>
        ) : (
          <div
            key={c.key}
            aria-hidden
            className="flex items-center gap-2.5 rounded-3xl border bg-card/60 p-2.5 duration-300 animate-in fade-in-0 fill-mode-backwards sm:gap-3 sm:p-3"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="skeleton h-11 w-11 shrink-0 rounded-2xl sm:h-14 sm:w-14" />
            <span className="flex-1 space-y-2">
              <span className="skeleton block h-3 w-3/4 rounded-full" />
              <span className="skeleton block h-2.5 w-1/3 rounded-full" />
            </span>
          </div>
        )
      )}
    </div>
  );
}
