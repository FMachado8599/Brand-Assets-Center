"use client";

import { memo, useState } from "react";
import { Check, Download, Loader2, Star } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { charFor, fileName, imageUrl, variantId, type EmojiEntry, type Tone } from "@/lib/emojis/types";
import { cn } from "@/lib/utils";

type Props = {
  emoji: EmojiEntry;
  tone: Tone;
  favorite: boolean;
  selected: boolean;
  /** Hay una selección en curso: el click selecciona en vez de copiar. */
  selecting: boolean;
  /** Primer resultado de la búsqueda: es el que copia Enter. */
  highlight?: boolean;
  /** La miniatura no cargó: se muestra el carácter en su lugar. */
  broken?: boolean;
  size?: "md" | "sm";
  onActivate: (emoji: EmojiEntry) => Promise<unknown>;
  onToggleFavorite: (emoji: EmojiEntry) => void;
  onToggleSelect: (emoji: EmojiEntry) => void;
  onDownload: (emoji: EmojiEntry) => Promise<unknown>;
};

export const EmojiTile = memo(function EmojiTile({
  emoji,
  tone,
  favorite,
  selected,
  selecting,
  highlight,
  broken,
  size = "md",
  onActivate,
  onToggleFavorite,
  onToggleSelect,
  onDownload,
}: Props) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [downloading, setDownloading] = useState(false);
  const id = variantId(emoji, tone);

  const run = async () => {
    if (state === "busy") return;
    setState("busy");
    try {
      await onActivate(emoji);
      setState("done");
      setTimeout(() => setState("idle"), 1100);
    } catch {
      setState("idle");
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      await onDownload(emoji);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="group/tile relative duration-200 animate-in fade-in-0 zoom-in-95">
      <Hint label={emoji.n}>
        <button
          type="button"
          aria-label={`${emoji.n}${selecting ? " (seleccionar)" : " (copiar)"}`}
          aria-pressed={selecting ? selected : undefined}
          onClick={(e) => {
            if (selecting || e.metaKey || e.ctrlKey || e.shiftKey) onToggleSelect(emoji);
            else run();
          }}
          draggable
          onDragStart={(e) => {
            // Arrastrar al escritorio baja el PNG grande (Chrome); a otras apps llega la URL.
            const url = new URL(imageUrl(id, true), window.location.href).href;
            e.dataTransfer.setData("DownloadURL", `image/png:${fileName(emoji, tone)}.png:${url}`);
            e.dataTransfer.setData("text/uri-list", url);
          }}
          className={cn(
            "relative grid aspect-square w-full place-items-center rounded-2xl outline-none transition-all duration-150 hover:bg-white hover:shadow-[0_2px_10px_-4px_rgba(0,0,0,0.18)] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
            highlight && "bg-white ring-2 ring-primary",
            selected && "bg-primary/25 ring-2 ring-primary hover:bg-primary/30"
          )}
        >
          {broken ? (
            <span className={cn("select-none leading-none", size === "sm" ? "text-3xl" : "text-[40px]", state !== "idle" && "opacity-30")}>
              {charFor(emoji, tone)}
            </span>
          ) : (
            // La imagen ya está precargada (useImageReveal): aparece completa, sin parpadeo.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl(id)}
              alt=""
              decoding="async"
              draggable={false}
              className={cn(
                "pointer-events-none select-none transition-transform duration-150 group-hover/tile:scale-110",
                size === "sm" ? "h-9 w-9" : "h-[52px] w-[52px]",
                state !== "idle" && "scale-90 opacity-30"
              )}
            />
          )}
          {state === "busy" && <Loader2 className="absolute h-5 w-5 animate-spin text-foreground/70" />}
          {state === "done" && (
            <span className="absolute grid h-7 w-7 place-items-center rounded-full bg-foreground text-background duration-200 animate-in zoom-in-50">
              <Check className="h-4 w-4" />
            </span>
          )}
        </button>
      </Hint>

      {size === "md" && (
        <>
          <button
            type="button"
            aria-label={selected ? "Quitar de la selección" : "Seleccionar"}
            onClick={() => onToggleSelect(emoji)}
            className={cn(
              "absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full border border-foreground/20 bg-white/90 text-transparent opacity-0 shadow-sm transition-opacity hover:border-foreground/40 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100",
              (selected || selecting) && "opacity-100",
              selected && "border-foreground bg-foreground text-background"
            )}
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label={favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
            onClick={() => onToggleFavorite(emoji)}
            className={cn(
              "absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full text-foreground/40 opacity-0 transition hover:bg-white hover:text-foreground group-hover/tile:opacity-100 group-focus-within/tile:opacity-100",
              favorite && "text-amber-500 opacity-100 hover:text-amber-600"
            )}
          >
            <Star className={cn("h-3.5 w-3.5", favorite && "fill-current")} />
          </button>
          <button
            type="button"
            aria-label="Descargar PNG"
            onClick={download}
            className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full text-foreground/50 opacity-0 transition hover:bg-white hover:text-foreground group-hover/tile:opacity-100 group-focus-within/tile:opacity-100"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          </button>
        </>
      )}
    </div>
  );
});
