"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdCard } from "./pieces";

const isFileDrag = (e: DragEvent) => [...e.dataTransfer.types].includes("Files");

/**
 * Los slides de un carrusel, para ordenarlos arrastrándolos (con el teclado: ← y → sobre el slide elegido) y
 * sacarlos con la cruz. Lo usan «Ordenar slides» y el paso de los archivos al agregar un carrusel. Arrastrar
 * archivos desde la compu no lo toca: eso lo maneja quien lo usa.
 */
export function SlideGrid({
  cards,
  onMove,
  onRemove,
  isNew,
  canRemove = true,
  children,
  className,
}: {
  cards: AdCard[];
  onMove: (from: number, to: number) => void;
  onRemove: (card: AdCard) => void;
  /** Los recién sumados, marcados con «Nuevo». */
  isNew?: (card: AdCard) => boolean;
  /** Si se puede sacar alguno (ej: no el último). */
  canRemove?: boolean;
  /** Al final de la grilla (ej: el lugar para sumar más). */
  children?: ReactNode;
  className?: string;
}) {
  const dragging = useRef<number | null>(null);
  /** El que se está arrastrando, para mostrarlo medio transparente. */
  const [held, setHeld] = useState<string | null>(null);
  const items = useRef(new Map<string, HTMLLIElement>());

  /** Con el teclado: lo mueve y sigue con el foco encima, para poder seguir moviéndolo. */
  const moveByKey = (card: AdCard, from: number, to: number) => {
    if (to < 0 || to >= cards.length) return;
    onMove(from, to);
    requestAnimationFrame(() => items.current.get(card.id)?.focus());
  };

  return (
    <ol className={cn("grid grid-cols-3 gap-3 overflow-y-auto overflow-x-hidden p-2 sm:grid-cols-5", className)} aria-label="Slides del carrusel">
      {cards.map((c, i) => (
        <li
          key={c.id}
          ref={(el) => {
            if (el) items.current.set(c.id, el);
            else items.current.delete(c.id);
          }}
          draggable
          tabIndex={0}
          aria-label={`Slide ${i + 1} de ${cards.length}: ${c.media.name}. Arrastralo, o usá las flechas del teclado, para cambiarlo de lugar.`}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              moveByKey(c, i, e.key === "ArrowLeft" ? i - 1 : i + 1);
            }
            if ((e.key === "Delete" || e.key === "Backspace") && canRemove) onRemove(c);
          }}
          onDragStart={(e) => {
            dragging.current = i;
            setHeld(c.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", c.id);
          }}
          onDragOver={(e) => {
            if (isFileDrag(e) || dragging.current === null) return;
            e.preventDefault();
            if (dragging.current !== i) {
              onMove(dragging.current, i);
              dragging.current = i;
            }
          }}
          onDragEnd={() => {
            dragging.current = null;
            setHeld(null);
          }}
          className={cn(
            "group relative cursor-grab rounded-xl outline-none ring-ring ring-offset-2 ring-offset-card transition-opacity focus-visible:ring-2 active:cursor-grabbing",
            held === c.id && "opacity-40"
          )}
        >
          <span className={cn("relative block aspect-[4/5] overflow-hidden rounded-xl bg-secondary ring-2", isNew?.(c) ? "ring-primary" : "ring-transparent")}>
            {c.media.kind === "video" ? (
              <video src={c.media.url} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.media.url} alt="" draggable={false} className="h-full w-full object-cover" />
            )}
            {isNew?.(c) && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-primary px-1.5 text-[10px] font-semibold leading-5 text-primary-foreground">Nuevo</span>}
          </span>
          <span className="absolute left-1.5 top-1.5 rounded-md bg-ink/80 px-1.5 text-[11px] font-semibold tabular-nums leading-5 text-cream">{i + 1}</span>
          <button
            type="button"
            aria-label={`Sacar el slide ${i + 1}`}
            onClick={() => onRemove(c)}
            disabled={!canRemove}
            className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-foreground text-background shadow disabled:hidden"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <span className="mt-1 block truncate text-center text-[10px] text-muted-foreground" title={c.media.name}>
            {c.media.name}
          </span>
        </li>
      ))}
      {children}
    </ol>
  );
}

/** Mueve un elemento de lugar (sin tocar la lista original). */
export function moveItem<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
