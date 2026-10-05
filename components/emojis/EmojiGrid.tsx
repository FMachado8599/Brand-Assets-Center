"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { isBroken, useImageReveal } from "@/hooks/useImageReveal";
import { imageUrl, PAGE_SIZE, variantId, type EmojiEntry, type Tone } from "@/lib/emojis/types";
import { EmojiTile } from "./EmojiTile";

export type TileActions = {
  tone: Tone;
  favorites: Set<string>;
  selected: Set<string>;
  selecting: boolean;
  onActivate: (emoji: EmojiEntry) => Promise<unknown>;
  onToggleFavorite: (emoji: EmojiEntry) => void;
  onToggleSelect: (emoji: EmojiEntry) => void;
  onDownload: (emoji: EmojiEntry) => Promise<unknown>;
};

type Props = TileActions & {
  items: EmojiEntry[];
  /** Fin acumulado de cada página recibida (de usePagedEmojis). */
  batches: number[];
  /** Esqueletos de la página que todavía está en camino. */
  pending: number;
  /** "batch": la página aparece entera de una. "ordered": de a uno, en orden. */
  mode: "batch" | "ordered";
  /** Cambia cuando cambia la lista (otra categoría, otra búsqueda): reinicia la aparición. */
  resetKey: string;
  /** Emojis que ya cargaron pero se ocultan (ej: favoritos que se acaban de quitar). */
  hidden?: (id: string) => boolean;
  highlightFirst?: boolean;
};

/**
 * Grilla de emojis con esqueletos. Las imágenes se precargan y recién se
 * muestran cuando están listas, así no aparecen salteadas ni a medio cargar.
 */
export function EmojiGrid({
  items,
  batches,
  pending,
  mode,
  resetKey,
  hidden,
  highlightFirst,
  tone,
  favorites,
  selected,
  ...actions
}: Props) {
  const urls = useMemo(() => items.map((e) => imageUrl(variantId(e, tone))), [items, tone]);
  const shown = useImageReveal(urls, batches, mode, `${resetKey}|${tone}`);
  const cells = items.length + pending;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1">
      {Array.from({ length: cells }, (_, i) => {
        if (i >= shown) return <SkeletonCell key={`s${i}`} index={i} />;
        const emoji = items[i];
        if (hidden?.(emoji.i)) return null;
        return (
          <EmojiTile
            key={emoji.i}
            emoji={emoji}
            tone={tone}
            favorite={favorites.has(emoji.i)}
            selected={selected.has(emoji.i)}
            highlight={highlightFirst && i === 0}
            broken={isBroken(urls[i])}
            {...actions}
          />
        );
      })}
    </div>
  );
}

/** Aparece en cascada (izquierda a derecha, arriba a abajo) con un brillo que lo recorre. */
function SkeletonCell({ index }: { index: number }) {
  return (
    <div
      aria-hidden
      className="grid aspect-square place-items-center rounded-2xl duration-300 animate-in fade-in-0 zoom-in-75 fill-mode-backwards"
      style={{ animationDelay: `${(index % PAGE_SIZE) * 12}ms` }}
    >
      <span className="skeleton h-[46px] w-[46px] rounded-full" />
    </div>
  );
}

export function LoadMore({
  remaining,
  loading,
  onClick,
}: {
  remaining: number;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <div className="mt-6 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="flex h-10 items-center gap-2 rounded-full border bg-card px-5 text-sm font-medium shadow-sm transition hover:bg-secondary disabled:cursor-wait disabled:opacity-70"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Cargando…" : `Cargar más · quedan ${remaining}`}
      </button>
    </div>
  );
}
