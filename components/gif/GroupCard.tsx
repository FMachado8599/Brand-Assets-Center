"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Gauge, Loader2, Pause, Pencil, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFramePlayer } from "@/hooks/useFramePlayer";
import { formatKb } from "@/lib/gif/encode";
import { formatMs, totalDuration } from "@/lib/gif/parse";
import { QUALITY_COLORS, type GifGroup, type GifSettings } from "@/lib/gif/types";
import { cn } from "@/lib/utils";

type Props = {
  group: GifGroup;
  settings: GifSettings;
  rendered: { blob: Blob; url: string; colors: number; fits: boolean } | null;
  rendering: boolean;
  onEdit: () => void;
  onDownload: () => void;
  onMeasure: () => void;
};

export function GroupCard({ group, settings, rendered, rendering, onEdit, onDownload, onMeasure }: Props) {
  const [playing, setPlaying] = useState(true);
  const { index } = useFramePlayer(group.frames, settings, playing);
  const frame = group.frames[index];
  const over = rendered && !rendered.fits;
  // Si se ajustó al peso máximo, quedó con menos colores que la calidad elegida.
  const reduced = rendered && rendered.colors < QUALITY_COLORS[settings.quality];
  // Con tan pocos colores los degradés suelen verse escalonados: hay que mirarlo antes de entregar.
  const lowColors = reduced && rendered.colors <= 48;

  return (
    <article className="group/card flex flex-col overflow-hidden rounded-3xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="relative grid aspect-[4/3] place-items-center bg-[repeating-conic-gradient(hsl(var(--secondary))_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-4">
        {rendered ? (
          // Ya generado: se ve el GIF real, con su compresión y sus tiempos, no los frames originales.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rendered.url}
            alt={`${group.name}.gif`}
            className="max-h-full max-w-full rounded-sm object-contain shadow-[0_4px_16px_-6px_rgba(0,0,0,0.3)]"
            style={{ aspectRatio: `${group.width} / ${group.height}` }}
          />
        ) : (
          frame && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={frame.url}
              alt={frame.filename}
              className="max-h-full max-w-full rounded-sm object-contain shadow-[0_4px_16px_-6px_rgba(0,0,0,0.3)]"
              style={{ aspectRatio: `${group.width} / ${group.height}` }}
            />
          )
        )}
        {rendered ? (
          <span className="absolute left-3 top-3 rounded-full bg-foreground/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">
            GIF final
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pausar" : "Reproducir"}
            className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/90 opacity-0 shadow-sm transition-opacity hover:bg-white group-hover/card:opacity-100"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
        )}
        {!rendered && group.frames.length > 1 && (
          <div className="absolute inset-x-4 bottom-2.5 flex gap-1">
            {group.frames.map((f, i) => (
              <span key={f.id} className={cn("h-1 flex-1 rounded-full transition-colors", i === index ? "bg-foreground/80" : "bg-foreground/15")} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-mono text-sm font-semibold">{group.name}.gif</h3>
            <p className="text-xs text-muted-foreground">
              {group.frames.length} frames · {formatMs(totalDuration(group, settings))}
              {settings.loop ? " · loop" : ""}
            </p>
          </div>
          {group.warnings.length ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              <AlertTriangle className="h-3 w-3" /> {group.warnings.length}
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> OK
            </span>
          )}
        </div>

        {group.warnings.length > 0 && (
          <ul className="space-y-0.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            {group.warnings.slice(0, 3).map((w) => (
              <li key={w}>{w}</li>
            ))}
            {group.warnings.length > 3 && <li>y {group.warnings.length - 3} más…</li>}
          </ul>
        )}

        {lowColors && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            Para entrar en {settings.maxKb} KB bajó a {rendered.colors} colores: revisá que los degradés no se vean
            escalonados. Si se ven mal, probá con menos frames o una foto más simple.
          </p>
        )}

        <div className="mt-auto flex items-center gap-2">
          {rendered ? (
            <span
              className={cn(
                "mr-auto rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                over
                  ? "bg-destructive/10 text-destructive"
                  : lowColors
                    ? "bg-amber-100 text-amber-900"
                    : "bg-secondary text-foreground/80"
              )}
              title={
                over
                  ? `Supera el máximo de ${settings.maxKb} KB${settings.fit ? ` aun con ${rendered.colors} colores` : ""}`
                  : reduced
                    ? `Se bajó a ${rendered.colors} colores para entrar en ${settings.maxKb} KB`
                    : "Peso del GIF generado"
              }
            >
              {formatKb(rendered.blob.size)}
              {reduced && <span className="font-normal opacity-70"> · {rendered.colors} colores</span>}
            </span>
          ) : (
            <button
              type="button"
              onClick={onMeasure}
              disabled={rendering}
              className="mr-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
            >
              {rendering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gauge className="h-3 w-3" />}
              {rendering ? "Generando…" : "Calcular peso"}
            </button>
          )}
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil /> Frames
          </Button>
          <Button size="sm" onClick={onDownload} disabled={rendering} aria-label={`Descargar ${group.name}.gif`}>
            {rendering ? <Loader2 className="animate-spin" /> : <Download />} GIF
          </Button>
        </div>
      </div>
    </article>
  );
}
