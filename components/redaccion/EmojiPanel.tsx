"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, Loader2, Plus, Search, X } from "lucide-react";
import { LoadMore } from "@/components/emojis/EmojiGrid";
import { ToneDot, TonePanel } from "@/components/emojis/EmojiPanels";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/tooltip";
import { useDebounced } from "@/hooks/useDebounced";
import { isBroken, useImageReveal } from "@/hooks/useImageReveal";
import { usePagedEmojis, type EmojiSource } from "@/hooks/usePagedEmojis";
import { charFor, imageUrl, variantId, type CategorySummary, type EmojiEntry, type Tone } from "@/lib/emojis/types";
import type { SlimEmoji } from "@/lib/redaccion/types";
import { cn } from "@/lib/utils";

type AnyEmoji = SlimEmoji | EmojiEntry;

type Props = {
  categories: CategorySummary[];
  tone: Tone;
  onToneChange: (tone: Tone) => void;
  /** El cliente que se está mirando en el panel; null: los fijados para textos sin cliente. */
  brandName: string | null;
  brandEmojis: SlimEmoji[];
  recents: SlimEmoji[];
  favorites: string[];
  onInsert: (emoji: AnyEmoji) => void;
  onTogglePin: (emoji: AnyEmoji) => void;
  /** Lo abrió la persona (no es el panel que quedó abierto de la vez anterior): el foco va al buscador. */
  autoFocus?: boolean;
};

/** No roba el foco: el cursor sigue en el texto (o en el buscador) y se puede insertar varios seguidos. */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/**
 * Versión chica del módulo Emojis, al costado del texto: buscar, los fijados
 * del cliente, recientes, favoritos y, al final, las categorías. Un click
 * inserta el emoji donde está el cursor.
 */
export function EmojiPanel({
  categories,
  tone,
  onToneChange,
  brandName,
  brandEmojis,
  recents,
  favorites,
  onInsert,
  onTogglePin,
  autoFocus,
}: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useDebounced(query.trim(), 250);
  const [category, setCategory] = useState<CategorySummary | null>(null);
  const searching = debounced.length > 0;
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!query.trim()) setDebounced("");
  }, [query, setDebounced]);

  // Al abrir el panel ya se puede escribir para buscar.
  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const source = useMemo<EmojiSource | null>(() => {
    if (searching) return { kind: "search", q: debounced };
    if (category) return { kind: "group", group: category.id, subgroup: null, total: category.count };
    return favorites.length ? { kind: "ids", ids: favorites.slice(0, 120) } : null;
  }, [searching, debounced, category, favorites]);
  const paged = usePagedEmojis(source);

  const pinned = useMemo(() => new Set(brandEmojis.map((e) => e.i)), [brandEmojis]);
  const grid = { tone, pinned, brandName, onInsert, onTogglePin };

  const openCategory = (next: CategorySummary | null) => {
    setCategory(next);
    setQuery("");
  };

  const insertFirst = () => {
    if (query.trim() === debounced && paged.items[0]) onInsert(paged.items[0]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 pb-2">
        <label className="relative flex h-9 items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim()) setCategory(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") insertFirst();
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
            placeholder="Buscar emoji…"
            aria-label="Buscar emoji"
            className="h-9 w-full rounded-full bg-secondary/80 pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:bg-secondary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 focus-visible:ring-offset-0"
          />
          {query.trim() !== debounced || paged.searching ? (
            <Loader2 className="pointer-events-none absolute right-3 h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            query && (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onClick={() => {
                  setQuery("");
                  input.current?.focus();
                }}
                className="absolute right-1.5 grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )
          )}
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {searching || category ? (
          <>
          {!searching && (
            <button
              type="button"
              onClick={() => openCategory(null)}
              className="-ml-1 mb-1 flex h-7 items-center gap-0.5 rounded-full pl-1 pr-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Volver
            </button>
          )}
          <Section
            title={
              searching
                ? paged.searching
                  ? "Buscando…"
                  : paged.total
                  ? `${paged.total} para “${debounced}”`
                  : `Sin resultados para “${debounced}”`
                : category!.name
            }
            note={searching && !!paged.total ? "Enter inserta el primero" : undefined}
          >
            {paged.error && !paged.items.length ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No se pudieron cargar ({paged.error}).</p>
            ) : (
              <>
                <MiniGrid items={paged.items} batches={paged.batches} pending={paged.pending} resetKey={paged.key} {...grid} />
                {paged.nextCursor !== null && paged.items.length > 0 && (
                  <LoadMore remaining={(paged.total ?? 0) - paged.items.length} loading={paged.loading} onClick={paged.loadMore} />
                )}
              </>
            )}
          </Section>
          </>
        ) : (
          <div className="space-y-4">
            <Section title={brandName ? `De ${brandName}` : "Sin cliente"} count={brandEmojis.length || undefined}>
              {brandEmojis.length ? (
                <MiniGrid items={brandEmojis} batches={[brandEmojis.length]} pending={0} resetKey="cliente" removable {...grid} />
              ) : (
                <p className="rounded-2xl border border-dashed border-foreground/15 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                  Pasá el mouse por un emoji y tocá <Plus className="inline h-3 w-3" /> para tenerlo siempre a mano en{" "}
                  {brandName ?? "los textos sin cliente"}.
                </p>
              )}
            </Section>
            {recents.length > 0 && (
              <Section title="Recientes" count={recents.length}>
                <MiniGrid items={recents} batches={[recents.length]} pending={0} resetKey="recientes" {...grid} />
              </Section>
            )}
            {favorites.length > 0 && (
              <Section title="Favoritos" count={favorites.length}>
                <MiniGrid items={paged.items} batches={paged.batches} pending={paged.pending} resetKey="favoritos" {...grid} />
              </Section>
            )}
            <Section title="Categorías">
              <div className="grid grid-cols-2 gap-0.5">
                {categories.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => openCategory(c)}
                    title={`${c.name} · ${c.count}`}
                    className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition-colors hover:bg-secondary"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl(c.cover.i)} alt="" className="h-5 w-5 shrink-0" />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span>Click: inserta en el cursor</span>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full px-2 py-1 font-medium transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ToneDot tone={tone} className="h-3.5 w-3.5" /> Tono
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" side="top">
            <TonePanel tone={tone} onChange={onToneChange} />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function Section({ title, count, note, children }: { title: string; count?: number; note?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-baseline gap-2 px-0.5 text-xs font-semibold">
        <span className="truncate">{title}</span>
        {count !== undefined && <span className="font-normal tabular-nums text-muted-foreground">{count}</span>}
        {note && <span className="ml-auto shrink-0 font-normal text-muted-foreground">{note}</span>}
      </h3>
      {children}
    </section>
  );
}

function MiniGrid({
  items,
  batches,
  pending,
  resetKey,
  tone,
  pinned,
  brandName,
  onInsert,
  onTogglePin,
  removable,
}: {
  items: AnyEmoji[];
  batches: number[];
  pending: number;
  resetKey: string;
  tone: Tone;
  pinned: Set<string>;
  brandName: string | null;
  onInsert: (emoji: AnyEmoji) => void;
  onTogglePin: (emoji: AnyEmoji) => void;
  /** Son los del cliente: el botón de la esquina los quita (y solo aparece al pasar el mouse). */
  removable?: boolean;
}) {
  const urls = useMemo(() => items.map((e) => imageUrl(variantId(e, tone))), [items, tone]);
  const shown = useImageReveal(urls, batches, "batch", `${resetKey}|${tone}`);
  const cells = items.length + pending;
  const pin = brandName ? `Fijar en ${brandName}` : "Fijar para textos sin cliente";
  const unpin = brandName ? `Quitar de ${brandName}` : "Quitar de los fijados";

  return (
    <div className="grid grid-cols-7 gap-0.5">
      {Array.from({ length: cells }, (_, index) => {
        if (index >= shown) {
          return (
            <span key={`s${index}`} aria-hidden className="grid aspect-square place-items-center">
              <span className="skeleton h-7 w-7 rounded-full" />
            </span>
          );
        }
        const emoji = items[index];
        const isPinned = pinned.has(emoji.i);
        return (
          <div key={emoji.i} className="group/mini relative duration-200 animate-in fade-in-0 zoom-in-95">
            <Hint label={emoji.n}>
              <button
                type="button"
                aria-label={`Insertar ${emoji.n}`}
                onMouseDown={keepFocus}
                onClick={() => onInsert(emoji)}
                className="grid aspect-square w-full place-items-center rounded-xl transition hover:bg-secondary active:scale-90"
              >
                {isBroken(urls[index]) ? (
                  <span className="text-2xl leading-none">{charFor(emoji, tone)}</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urls[index]}
                    alt=""
                    draggable={false}
                    className="pointer-events-none h-7 w-7 select-none transition-transform duration-150 group-hover/mini:scale-110"
                  />
                )}
              </button>
            </Hint>
            <button
              type="button"
              aria-label={isPinned ? unpin : pin}
              title={isPinned ? unpin : pin}
              onMouseDown={keepFocus}
              onClick={() => onTogglePin(emoji)}
              className={cn(
                "absolute -right-0.5 -top-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-white text-foreground/70 opacity-0 shadow-sm ring-1 ring-black/10 transition-opacity hover:text-foreground group-hover/mini:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
                isPinned && !removable && "bg-primary text-primary-foreground opacity-100 ring-primary"
              )}
            >
              {removable ? (
                <X className="h-2.5 w-2.5" strokeWidth={3} />
              ) : isPinned ? (
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              ) : (
                <Plus className="h-2.5 w-2.5" strokeWidth={3} />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
