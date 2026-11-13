"use client";

import { Copy, Download } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import type { Gif } from "@/lib/library/gifs";
import { gifName } from "@/lib/library/gifs.client";
import { CHECKER } from "../LibraryParts";

/** Un GIF de la grilla: tocarlo abre el detalle; al pasar el mouse, copiar y bajar a un click. */
export function GifTile({
  gif,
  sticker,
  onOpen,
  onCopy,
  onDownload,
}: {
  gif: Gif;
  sticker: boolean;
  onOpen: () => void;
  onCopy: () => void;
  onDownload: () => void;
}) {
  const { url, width, height } = gif.preview;
  const quick =
    "pointer-events-auto grid h-8 w-8 place-items-center rounded-full bg-ink/80 text-cream shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground";
  return (
    <figure className="group relative overflow-hidden rounded-xl bg-secondary" style={sticker ? CHECKER : undefined}>
      <button type="button" onClick={onOpen} className="block w-full focus-visible:outline-none" aria-label={`Ver ${gifName(gif)}`}>
        <img
          src={url}
          alt={gifName(gif)}
          loading="lazy"
          decoding="async"
          width={width}
          height={height}
          className="block h-auto w-full"
          style={{ aspectRatio: `${width} / ${height}` }}
        />
      </button>
      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-end gap-1.5 bg-gradient-to-t from-ink/55 to-transparent p-2 pt-8 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:hidden">
        <Hint label="Copiar (para pegar en Slack, Gmail, Docs o Slides)">
          <button type="button" onClick={onCopy} aria-label="Copiar GIF" className={quick}>
            <Copy className="h-4 w-4" />
          </button>
        </Hint>
        <Hint label="Descargar GIF">
          <button type="button" onClick={onDownload} aria-label="Descargar GIF" className={quick}>
            <Download className="h-4 w-4" />
          </button>
        </Hint>
      </figcaption>
    </figure>
  );
}
