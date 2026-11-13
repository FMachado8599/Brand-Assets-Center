"use client";

import { Copy, Download, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBytes } from "@/lib/converter/catalog";
import type { Gif, GifFormat } from "@/lib/library/gifs";
import { gifName } from "@/lib/library/gifs.client";
import { CHECKER } from "../LibraryParts";
import { PoweredByGiphy } from "./PoweredByGiphy";

const FORMATS: { format: GifFormat; label: string; hint: string }[] = [
  { format: "gif", label: "GIF", hint: "El de siempre: anda en todos lados." },
  { format: "mp4", label: "MP4", hint: "Para presentaciones: pesa mucho menos y anda en Keynote, PowerPoint y Slides." },
  { format: "webp", label: "WEBP", hint: "Animado y liviano, para la web. Conserva la transparencia." },
];

/** El detalle de un GIF: en grande, y cada formato para bajar, con lo que pesa. */
export function GifDialog({
  gif,
  sticker,
  onOpenChange,
  onCopy,
  onCopyLink,
  onDownload,
}: {
  gif: Gif;
  sticker: boolean;
  onOpenChange: (open: boolean) => void;
  onCopy: () => void;
  onCopyLink: () => void;
  onDownload: (format: GifFormat) => void;
}) {
  const big = gif.files.webp ?? gif.files.gif;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-5 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">{gifName(gif)}</DialogTitle>
          <DialogDescription>
            {[gif.user, `${gif.files.gif.width} × ${gif.files.gif.height}`].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1fr_15rem]">
          <div className="grid min-h-48 place-items-center overflow-hidden rounded-xl bg-secondary" style={sticker ? CHECKER : undefined}>
            <img
              src={big.url}
              alt={gifName(gif)}
              width={big.width}
              height={big.height}
              className="max-h-[55vh] w-auto max-w-full object-contain"
              style={{ aspectRatio: `${big.width} / ${big.height}` }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="eyebrow">Descargar</p>
            {FORMATS.map(({ format, label, hint }) => {
              const file = gif.files[format];
              if (!file) return null;
              return (
                <Button
                  key={format}
                  variant={format === "gif" ? "default" : "outline"}
                  onClick={() => onDownload(format)}
                  title={hint}
                  className="justify-start"
                >
                  <Download /> {label}
                  {file.bytes && <span className="ml-auto text-xs font-normal opacity-70">{formatBytes(file.bytes)}</span>}
                </Button>
              );
            })}
            {gif.files.mp4 && !sticker && (
              <p className="text-xs text-muted-foreground">El MP4 es para presentaciones: pesa mucho menos que el GIF.</p>
            )}

            <p className="eyebrow mt-3">Copiar</p>
            <Button variant="secondary" onClick={onCopy} className="justify-start" title="Para pegar en Slack, Gmail, Docs, Slides o Notion">
              <Copy /> Copiar GIF
            </Button>
            <Button variant="ghost" onClick={onCopyLink} className="justify-start">
              <Link2 /> Copiar link de GIPHY
            </Button>
            <a
              href={gif.page}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 px-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Ver en GIPHY
            </a>
          </div>
        </div>

        <PoweredByGiphy className="justify-end" />
      </DialogContent>
    </Dialog>
  );
}
