"use client";

import { Copy, Download, Loader2 } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import type { Icon } from "@/lib/library/iconos";
import { cn } from "@/lib/utils";

/** Un ícono de la grilla: tocarlo abre el detalle; al pasar el mouse, copiar el SVG o bajarlo a un click. */
export function IconTile({
  icon,
  busy,
  onOpen,
  onCopy,
  onDownload,
}: {
  icon: Icon;
  busy: boolean;
  onOpen: () => void;
  onCopy: () => void;
  onDownload: () => void;
}) {
  const quick =
    "grid h-7 w-7 place-items-center rounded-full bg-ink text-cream transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50";
  return (
    <li className="group relative aspect-square overflow-hidden rounded-2xl border bg-card shadow-[0_1px_0_hsl(240_12%_5%/0.04)] transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        title={icon.name}
        className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 pb-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <img src={icon.thumb} alt={icon.name} loading="lazy" decoding="async" className="h-12 w-12 object-contain sm:h-14 sm:w-14" draggable={false} />
      </button>
      <p
        className={cn(
          "pointer-events-none absolute inset-x-2 bottom-2 truncate text-center text-[11px] text-muted-foreground transition-opacity",
          "group-focus-within:opacity-0 group-hover:opacity-0 [@media(hover:none)]:opacity-100"
        )}
      >
        {icon.name}
      </p>
      <div
        className={cn(
          "absolute inset-x-0 bottom-1.5 flex justify-center gap-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:hidden",
          busy && "opacity-100"
        )}
      >
        {busy ? (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-cream">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </span>
        ) : (
          <>
            <Hint label="Copiar SVG (para Figma o Illustrator)">
              <button type="button" onClick={onCopy} aria-label={`Copiar SVG de ${icon.name}`} className={quick}>
                <Copy className="h-3.5 w-3.5" />
              </button>
            </Hint>
            <Hint label="Descargar SVG">
              <button type="button" onClick={onDownload} aria-label={`Descargar SVG de ${icon.name}`} className={quick}>
                <Download className="h-3.5 w-3.5" />
              </button>
            </Hint>
          </>
        )}
      </div>
    </li>
  );
}
