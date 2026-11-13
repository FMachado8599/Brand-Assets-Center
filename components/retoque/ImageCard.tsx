"use client";

import { useState } from "react";
import { AlertCircle, Check, Clock, Copy, Download, Info, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { formatBytes } from "@/lib/converter/catalog";
import { asPng, outputName } from "@/lib/retoque/prepare.client";
import { isBusy, type RetoqueItem, type RetoqueStatus } from "@/hooks/useRetoqueQueue";
import { cn } from "@/lib/utils";
import { backdropStyle, type Backdrop } from "./backdrops";

const STEPS: Partial<Record<RetoqueStatus, string>> = {
  queued: "En espera",
  preparing: "Preparando…",
  uploading: "Subiendo…",
  processing: "Quitando el fondo…",
  downloading: "Bajando el PNG…",
};

export function canCopyImages() {
  return typeof window !== "undefined" && "ClipboardItem" in window && typeof navigator.clipboard?.write === "function";
}

export function ImageCard({
  item,
  backdrop,
  onRetry,
  onRemove,
  onDownload,
}: {
  item: RetoqueItem;
  backdrop: Backdrop;
  onRetry: () => void;
  onRemove: () => void;
  onDownload: () => void;
}) {
  const busy = isBusy(item.status);
  const done = item.status === "done" && !!item.resultUrl;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!item.result) return;
    try {
      // La promesa va directo al ClipboardItem: Safari exige armarlo en el mismo click.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": asPng(item.result) })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("El navegador no dejó copiar la imagen: descargala", "error");
    }
  };

  return (
    <li className="group relative flex flex-col overflow-hidden rounded-3xl border bg-card shadow-sm duration-300 animate-in fade-in-0 zoom-in-95">
      {done ? (
        <Compare original={item.originalUrl} result={item.resultUrl!} backdrop={backdrop} />
      ) : (
        <div className="relative aspect-[4/3] overflow-hidden" style={backdropStyle("light")}>
          <img
            src={item.originalUrl}
            alt=""
            draggable={false}
            className={cn(
              "absolute inset-0 h-full w-full object-contain p-3 transition-[opacity,filter] duration-500",
              item.status !== "error" && "opacity-45 blur-[1.5px]",
              item.status === "error" && "opacity-60 grayscale"
            )}
          />
          {(busy || item.status === "queued") && (
            <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink/85 px-3 py-1.5 text-xs font-medium text-cream shadow-sm">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
              {STEPS[item.status]}
            </span>
          )}
          {item.status === "error" && (
            <p className="absolute inset-x-4 top-1/2 flex -translate-y-1/2 items-start justify-center gap-1.5 text-balance rounded-2xl bg-card/95 px-3 py-2 text-center text-xs font-medium text-destructive shadow-sm">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              {item.error}
            </p>
          )}
          {busy && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-primary" />}
        </div>
      )}

      {!busy && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Quitar de la lista"
          title="Quitar de la lista"
          className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-ink/70 text-cream opacity-0 shadow-sm transition-opacity hover:bg-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="flex items-center gap-2 border-t px-3 py-2.5">
        <div className="min-w-0 flex-1 pl-1">
          <p className="truncate text-sm font-medium" title={item.file.name}>
            {item.file.name}
          </p>
          <Status item={item} />
        </div>

        {done && (
          <>
            {canCopyImages() && (
              <Button variant="ghost" size="iconSm" onClick={copy} aria-label="Copiar la imagen" title="Copiar la imagen">
                {copied ? <Check className="text-emerald-700" /> : <Copy />}
              </Button>
            )}
            <Button size="sm" onClick={onDownload} title={`Descargar ${outputName(item.file.name)}`}>
              <Download /> PNG
            </Button>
          </>
        )}
        {item.status === "error" && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw /> Reintentar
          </Button>
        )}
      </div>
    </li>
  );
}

function Status({ item }: { item: RetoqueItem }) {
  if (item.status === "error") return <p className="text-xs text-destructive">No se pudo quitar el fondo</p>;
  const size = item.width && item.height ? `${item.width} × ${item.height}` : null;
  const weight = item.result ? formatBytes(item.result.size) : formatBytes(item.file.size);
  return (
    <p className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
      <span className="truncate">{[size, weight].filter(Boolean).join(" · ")}</span>
      {item.note && (
        <span title={item.note} className="shrink-0 text-amber-700">
          <Info className="h-3 w-3" aria-label={item.note} />
        </span>
      )}
    </p>
  );
}

/**
 * El resultado, y al pasar el mouse (o el dedo) la original de un lado de la línea: para ver qué se llevó
 * Magnific y cómo quedaron los bordes.
 */
function Compare({ original, result, backdrop }: { original: string; result: string; backdrop: Backdrop }) {
  const [pos, setPos] = useState<number | null>(null);

  const follow = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      className="relative aspect-[4/3] cursor-ew-resize touch-pan-y select-none overflow-hidden"
      style={backdropStyle(backdrop)}
      onPointerMove={follow}
      onPointerDown={follow}
      onPointerLeave={() => setPos(null)}
      onPointerCancel={() => setPos(null)}
    >
      <img src={result} alt="La imagen sin fondo" draggable={false} className="absolute inset-0 h-full w-full object-contain p-3" />
      {pos !== null && (
        <>
          <img
            src={original}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain p-3"
            style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          />
          <span aria-hidden className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary shadow-[0_0_0_1px_rgb(0_0_0/0.15)]" style={{ left: `${pos}%` }} />
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-ink/75 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-cream">
            Original
          </span>
          <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-ink/75 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-cream">
            Sin fondo
          </span>
        </>
      )}
    </div>
  );
}
