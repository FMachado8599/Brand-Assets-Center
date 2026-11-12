"use client";

import { Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Frame } from "@/lib/gif/types";
import { cn } from "@/lib/utils";
import { useFrameDrop, type FrameDrag } from "./drag";

/**
 * Las imágenes que no se pudieron agrupar por el nombre. Se arma un GIF soltando una sobre otra (o
 * sobre un GIF de arriba), o eligiéndolas con un clic en el orden que van y tocando «Armar GIF».
 */
export function LooseTray({
  frames,
  drag,
  selected,
  onToggle,
  onClearSelection,
  onCombine,
  onMakeGif,
  onRemove,
}: {
  frames: Frame[];
  drag: FrameDrag;
  /** Las elegidas, en el orden en que se eligieron: es el orden del GIF. */
  selected: string[];
  onToggle: (id: string) => void;
  onClearSelection: () => void;
  /** Soltar `dragged` sobre `target`: arman un GIF nuevo. */
  onCombine: (target: Frame, draggedId: string) => void;
  onMakeGif: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-dashed border-foreground/15 bg-card/60 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="h-4 w-4 text-muted-foreground" /> Sueltas
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium tabular-nums">{frames.length}</span>
        </h2>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {selected.length
            ? "Elegí las que van, en el orden del GIF."
            : "Arrastrá una sobre otra para armar un GIF, o sobre un GIF para sumarla. También podés elegirlas con un clic."}
        </p>
        {selected.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={onClearSelection}>
              Cancelar
            </Button>
            <Button size="sm" onClick={onMakeGif} disabled={selected.length < 2}>
              <Layers /> {selected.length < 2 ? "Elegí otra" : `Armar GIF con ${selected.length}`}
            </Button>
          </div>
        )}
      </div>

      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
        {frames.map((frame) => (
          <LooseThumb
            key={frame.id}
            frame={frame}
            drag={drag}
            position={selected.indexOf(frame.id)}
            onToggle={() => onToggle(frame.id)}
            onCombine={(id) => onCombine(frame, id)}
            onRemove={() => onRemove(frame.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function LooseThumb({
  frame,
  drag,
  position,
  onToggle,
  onCombine,
  onRemove,
}: {
  frame: Frame;
  drag: FrameDrag;
  /** Lugar entre las elegidas (-1 = no está elegida). */
  position: number;
  onToggle: () => void;
  onCombine: (draggedId: string) => void;
  onRemove: () => void;
}) {
  const held = drag.id === frame.id;
  const drop = useFrameDrop(!!drag.id && !held, () => drag.id && onCombine(drag.id));
  const chosen = position >= 0;

  return (
    <li
      draggable
      onDragStart={(e) => drag.start(e, frame.id)}
      onDragEnd={drag.end}
      {...drop.handlers}
      className={cn("group relative cursor-grab active:cursor-grabbing", held && "opacity-40")}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={chosen}
        aria-label={`${frame.filename}, ${frame.natural.width}×${frame.natural.height}. Arrastrala sobre otra imagen o sobre un GIF para agruparla, o elegila para armar uno.`}
        className={cn(
          "relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-[repeating-conic-gradient(hsl(var(--secondary))_0_25%,transparent_0_50%)] bg-[length:12px_12px] p-2 outline-none ring-2 ring-transparent ring-offset-2 ring-offset-card transition focus-visible:ring-ring",
          chosen && "ring-foreground",
          drop.over && "ring-primary"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frame.url} alt="" draggable={false} className="max-h-full max-w-full object-contain shadow-sm" />
        {drop.over && (
          <span className="absolute inset-0 grid place-items-center bg-primary/80 px-2 text-center text-xs font-semibold text-primary-foreground">
            Armar GIF
          </span>
        )}
        {chosen && (
          <span className="absolute left-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1 text-[11px] font-semibold tabular-nums text-background">
            {position + 1}
          </span>
        )}
      </button>
      <button
        type="button"
        aria-label={`Quitar ${frame.filename}`}
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-foreground text-background opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="mt-1.5 truncate text-center font-mono text-[10px]" title={frame.filename}>
        {frame.filename}
      </p>
      <p className="text-center text-[10px] tabular-nums text-muted-foreground">
        {frame.natural.width}×{frame.natural.height}
      </p>
    </li>
  );
}
