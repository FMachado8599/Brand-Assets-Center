"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pause, Play, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFramePlayer } from "@/hooks/useFramePlayer";
import { formatMs, frameDuration, totalDuration } from "@/lib/gif/parse";
import type { Frame, GifGroup, GifSettings } from "@/lib/gif/types";
import { cn } from "@/lib/utils";

const SOURCE: Record<Frame["durationSource"], string> = {
  filename: "del nombre",
  default: "por defecto",
  manual: "manual",
};

export function GroupDialog({
  group,
  settings,
  onClose,
  onDuration,
  onMove,
  onRemove,
}: {
  group: GifGroup | null;
  settings: GifSettings;
  onClose: () => void;
  onDuration: (id: string, ms: number | null) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  const [playing, setPlaying] = useState(true);
  const frames = group?.frames ?? [];
  const { index, setIndex } = useFramePlayer(frames, settings, playing);

  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        {group && (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono">{group.name}.gif</DialogTitle>
              <DialogDescription>
                {group.width}×{group.height} · {frames.length} frames · {formatMs(totalDuration(group, settings))}
              </DialogDescription>
            </DialogHeader>

            <div className="grid min-h-0 gap-5 overflow-y-auto sm:grid-cols-[1fr_1.15fr]">
              <div className="flex flex-col gap-2">
                <div className="grid aspect-[4/3] place-items-center rounded-2xl bg-[repeating-conic-gradient(hsl(var(--secondary))_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-3">
                  {frames[index] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={frames[index].url}
                      alt={frames[index].filename}
                      className="max-h-full max-w-full object-contain shadow-[0_4px_16px_-6px_rgba(0,0,0,0.3)]"
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
                {group.warnings.length > 0 && (
                  <ul className="space-y-0.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                    {group.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>

              <ol className="flex flex-col gap-1.5">
                {frames.map((frame, i) => (
                  <li
                    key={frame.id}
                    onMouseEnter={() => !playing && setIndex(i)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-2xl border p-2 transition-colors",
                      i === index ? "border-foreground/30 bg-secondary/60" : "bg-card"
                    )}
                  >
                    <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                      {frame.order}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={frame.url} alt="" className="h-10 w-14 shrink-0 rounded-md bg-secondary object-contain" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11px]" title={frame.filename}>
                        {frame.filename}
                      </p>
                      <DurationField frame={frame} settings={settings} onChange={(ms) => onDuration(frame.id, ms)} />
                    </div>
                    <div className="flex shrink-0 items-center">
                      <IconButton label="Subir" disabled={i === 0} onClick={() => onMove(frame.id, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label="Bajar" disabled={i === frames.length - 1} onClick={() => onMove(frame.id, 1)}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label="Quitar frame" onClick={() => onRemove(frame.id)} danger>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
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
