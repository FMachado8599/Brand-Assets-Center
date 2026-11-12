"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, Pause, Play, Plus, Trash2, Ungroup } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFramePlayer } from "@/hooks/useFramePlayer";
import { formatMs, frameDuration, totalDuration } from "@/lib/gif/parse";
import type { Frame, GifGroup, GifSettings } from "@/lib/gif/types";
import { cn } from "@/lib/utils";
import { armDrag, useFrameDrop, type FrameDrag } from "./drag";

const SOURCE: Record<Frame["durationSource"], string> = {
  filename: "del nombre",
  default: "por defecto",
  manual: "manual",
};

/**
 * El orden de los frames de un GIF: se arrastran a mano al lugar que van (o con ↑ ↓ sobre el
 * elegido). Abajo están las imágenes sueltas, para sumarlas sin cerrar; y un frame arrastrado hasta
 * ahí sale del GIF.
 */
export function GroupDialog({
  group,
  loose,
  settings,
  drag,
  onClose,
  onDuration,
  onMove,
  onAdd,
  onUngroup,
  onRemove,
  onRename,
}: {
  /** Puede tener un solo frame: el diálogo sigue abierto mientras se le suman otros. */
  group: GifGroup | null;
  /** Las sueltas que se le pueden sumar (sin las de este grupo). */
  loose: Frame[];
  settings: GifSettings;
  drag: FrameDrag;
  onClose: () => void;
  onDuration: (id: string, ms: number | null) => void;
  onMove: (id: string, to: number) => void;
  onAdd: (id: string, at?: number) => void;
  onUngroup: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (name: string) => void;
}) {
  const [playing, setPlaying] = useState(true);
  const frames = group?.frames ?? [];
  const { index, setIndex } = useFramePlayer(frames, settings, playing);
  const rows = useRef(new Map<string, HTMLLIElement>());

  const draggingOwn = !!drag.id && frames.some((f) => f.id === drag.id);
  const draggingLoose = !!drag.id && loose.some((f) => f.id === drag.id);

  // Dónde entra la suelta que se arrastra sobre la lista: antes de la fila de ese índice (frames.length = al final).
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const list = useFrameDrop(draggingLoose, () => {
    if (drag.id) onAdd(drag.id, insertAt ?? undefined);
    drag.end();
  });
  useEffect(() => {
    if (!list.over) setInsertAt(null);
  }, [list.over]);

  const tray = useFrameDrop(draggingOwn, () => {
    if (drag.id) onUngroup(drag.id);
    drag.end();
  });

  /** Con el teclado sigue con el foco en el frame que se movió, para poder seguir moviéndolo. */
  const moveByKey = (frame: Frame, to: number) => {
    if (to < 0 || to >= frames.length) return;
    onMove(frame.id, to);
    requestAnimationFrame(() => rows.current.get(frame.id)?.focus());
  };

  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        {group && (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Ordenar {group.name}.gif</DialogTitle>
              <NameField name={group.name} onRename={onRename} />
              <DialogDescription>
                {group.width}×{group.height} · {frames.length} {frames.length === 1 ? "frame" : "frames"} ·{" "}
                {formatMs(totalDuration(group, settings))}
              </DialogDescription>
            </DialogHeader>

            <div className="grid min-h-0 gap-5 overflow-y-auto p-0.5 sm:grid-cols-[1fr_1.2fr]">
              <div className="flex flex-col gap-2">
                <div className="grid aspect-[4/3] place-items-center rounded-2xl bg-[repeating-conic-gradient(hsl(var(--secondary))_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-3">
                  {frames[index] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={frames[index].url}
                      alt={frames[index].filename}
                      draggable={false}
                      className="max-h-full max-w-full object-contain shadow-[0_4px_16px_-6px_rgba(0,0,0,0.3)]"
                      style={{ aspectRatio: `${group.width} / ${group.height}` }}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setPlaying((p) => !p)}
                    className="flex items-center gap-1.5 rounded-full px-2 py-1 font-medium text-foreground hover:bg-secondary"
                  >
                    {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {playing ? "Pausar" : "Reproducir"}
                  </button>
                  <span className="tabular-nums">
                    {frames.length ? index + 1 : 0} / {frames.length}
                  </span>
                </div>
                {frames.length === 1 && (
                  <p className="rounded-xl bg-secondary px-3 py-2 text-[11px] text-muted-foreground">
                    Con un solo frame no es un GIF: sumale otra imagen. Si lo cerrás así, vuelve a las sueltas.
                  </p>
                )}
                {group.warnings.length > 0 && (
                  <ul className="space-y-0.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                    {group.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Arrastrá los frames al lugar que van (con el teclado: ↑ ↓).
                </p>
                <ol
                  {...list.handlers}
                  aria-label="Orden de los frames"
                  className={cn(
                    "flex flex-col gap-1.5 rounded-2xl transition-colors",
                    draggingLoose && "outline-dashed outline-2 outline-offset-4 outline-primary/40",
                    list.over && "outline-primary"
                  )}
                >
                  {frames.map((frame, i) => (
                    <li
                      key={frame.id}
                      ref={(el) => {
                        if (el) rows.current.set(frame.id, el);
                        else rows.current.delete(frame.id);
                      }}
                      tabIndex={0}
                      aria-label={`Frame ${i + 1} de ${frames.length}: ${frame.filename}`}
                      onPointerDown={armDrag}
                      onDragStart={(e) => drag.start(e, frame.id)}
                      onDragEnd={drag.end}
                      onDragOver={(e) => {
                        if (draggingOwn && drag.id !== frame.id) {
                          e.preventDefault();
                          onMove(drag.id, i);
                        } else if (draggingLoose) {
                          const box = e.currentTarget.getBoundingClientRect();
                          setInsertAt(e.clientY < box.top + box.height / 2 ? i : i + 1);
                        }
                      }}
                      onDrop={(e) => draggingOwn && e.preventDefault()}
                      onMouseEnter={() => !playing && setIndex(i)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                          e.preventDefault();
                          moveByKey(frame, e.key === "ArrowUp" ? i - 1 : i + 1);
                        }
                      }}
                      className={cn(
                        "flex cursor-grab items-center gap-2 rounded-2xl border p-2 outline-none ring-ring transition-colors focus-visible:ring-2 active:cursor-grabbing",
                        i === index ? "border-foreground/30 bg-secondary/60" : "bg-card",
                        drag.id === frame.id && "opacity-40",
                        list.over && insertAt === i && "shadow-[0_-4px_0_-1px_hsl(var(--primary))]",
                        list.over && insertAt === frames.length && i === frames.length - 1 && "shadow-[0_4px_0_-1px_hsl(var(--primary))]"
                      )}
                    >
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                      <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={frame.url}
                        alt=""
                        draggable={false}
                        className="h-12 w-16 shrink-0 rounded-md bg-secondary object-contain"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[11px]" title={frame.filename}>
                          {frame.filename}
                        </p>
                        <DurationField frame={frame} settings={settings} onChange={(ms) => onDuration(frame.id, ms)} />
                      </div>
                      <div className="flex shrink-0 items-center">
                        <IconButton label="Sacar del GIF (queda suelta)" onClick={() => onUngroup(frame.id)}>
                          <Ungroup className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton label="Quitar frame" onClick={() => onRemove(frame.id)} danger>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ol>

                {(loose.length > 0 || draggingOwn) && (
                  <section
                    {...tray.handlers}
                    aria-label="Imágenes sueltas"
                    className={cn(
                      "rounded-2xl border border-dashed p-3 transition-colors",
                      draggingOwn && "border-primary/50",
                      tray.over && "border-primary bg-primary/10"
                    )}
                  >
                    <p className="mb-2 text-xs font-medium">
                      {draggingOwn ? "Soltalo acá para sacarlo del GIF" : `Sueltas · ${loose.length}`}
                      {!draggingOwn && (
                        <span className="font-normal text-muted-foreground"> · arrastrala al lugar que va, o tocá + para sumarla al final</span>
                      )}
                    </p>
                    {loose.length > 0 && (
                      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                        {loose.map((f) => (
                          <li
                            key={f.id}
                            draggable
                            onDragStart={(e) => drag.start(e, f.id)}
                            onDragEnd={drag.end}
                            className={cn("group relative cursor-grab active:cursor-grabbing", drag.id === f.id && "opacity-40")}
                            title={f.filename}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={f.url}
                              alt={f.filename}
                              draggable={false}
                              className="aspect-square w-full rounded-xl bg-secondary object-contain p-1"
                            />
                            <button
                              type="button"
                              aria-label={`Sumar ${f.filename} al final`}
                              onClick={() => onAdd(f.id)}
                              className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-foreground text-background shadow"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={onClose}>Listo</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** El nombre del GIF, editable: es el del archivo que se descarga. */
function NameField({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  const commit = () => {
    if (draft.trim() && draft.trim() !== name) onRename(draft);
    else setDraft(name);
  };

  return (
    <label className="flex min-w-0 items-baseline font-mono text-lg font-semibold">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label="Nombre del GIF"
        spellCheck={false}
        style={{ width: `calc(${Math.max(3, draft.length)}ch + 0.75rem)` }}
        className="min-w-0 max-w-full rounded-md bg-transparent px-1 -mx-1 outline-none ring-ring transition hover:bg-secondary focus:bg-secondary focus-visible:ring-2"
      />
      <span className="text-muted-foreground">.gif</span>
    </label>
  );
}

/** Duración en la unidad de los ajustes; vacío vuelve a la de por defecto. */
function DurationField({
  frame,
  settings,
  onChange,
}: {
  frame: Frame;
  settings: GifSettings;
  onChange: (ms: number | null) => void;
}) {
  const toUnit = (ms: number) => (settings.unit === "s" ? +(ms / 1000).toFixed(3) : ms);
  const shown = frame.durationMs === null ? "" : String(toUnit(frame.durationMs));
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);

  const commit = () => {
    const v = parseFloat(draft.replace(",", "."));
    if (!draft.trim() || !Number.isFinite(v) || v <= 0) {
      onChange(null);
      setDraft("");
    } else onChange(Math.round(settings.unit === "s" ? v * 1000 : v));
  };

  return (
    <div className="mt-1 flex items-center gap-1.5">
      <Input
        value={draft}
        inputMode="decimal"
        placeholder={String(toUnit(frameDuration({ ...frame, durationMs: null }, settings)))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        aria-label={`Duración de ${frame.filename}`}
        className="h-7 w-16 px-2 text-xs"
      />
      <span className="text-[11px] text-muted-foreground">
        {settings.unit === "s" ? "s" : "ms"} · {SOURCE[frame.durationSource]}
      </span>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30",
        danger && "hover:bg-destructive/10 hover:text-destructive"
      )}
    >
      {children}
    </button>
  );
}
