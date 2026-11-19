"use client";

import { useState } from "react";
import { Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PNG_SIZES, type Icon, type IconFormat, type PngSize } from "@/lib/library/iconos";
import { cn } from "@/lib/utils";
import { CHECKER } from "../LibraryParts";

export type IconAction = { kind: "copy" | "download"; format: IconFormat };

/** El detalle de un ícono: SVG para copiar en vectores, y PNG del tamaño que se elija. */
export function IconDialog({
  icon,
  size,
  onSize,
  busy,
  onAction,
  onOpenChange,
}: {
  icon: Icon;
  size: PngSize;
  onSize: (size: PngSize) => void;
  /** La acción que está en curso, si hay una. */
  busy: IconAction | null;
  onAction: (action: IconAction) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [hover, setHover] = useState(false);
  const spin = (kind: IconAction["kind"], format: IconFormat) =>
    busy?.kind === kind && busy.format === format ? <Loader2 className="animate-spin" /> : kind === "copy" ? <Copy /> : <Download />;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-5">
        <DialogHeader>
          <DialogTitle className="first-letter:uppercase">{icon.name}</DialogTitle>
          <DialogDescription>{[icon.style, icon.family, icon.author].filter(Boolean).join(" · ") || "Magnific"}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-[11rem_1fr]">
          <div
            className="grid aspect-square place-items-center rounded-2xl border"
            style={hover ? CHECKER : undefined}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            title="Pasá el mouse para ver la transparencia"
          >
            <img src={icon.thumb} alt={icon.name} className="h-24 w-24 object-contain" draggable={false} />
          </div>

          <div className="flex flex-col gap-2">
            <p className="eyebrow">SVG · en vectores</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => onAction({ kind: "copy", format: "svg" })} disabled={!!busy} title="Pegalo en Figma o Illustrator y queda en vectores">
                {spin("copy", "svg")} Copiar
              </Button>
              <Button variant="outline" onClick={() => onAction({ kind: "download", format: "svg" })} disabled={!!busy}>
                {spin("download", "svg")} Descargar
              </Button>
            </div>

            <p className="eyebrow mt-3">PNG · transparente</p>
            <div role="radiogroup" aria-label="Tamaño del PNG" className="flex gap-1">
              {PNG_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={size === s}
                  onClick={() => onSize(s)}
                  className={cn(
                    "h-8 flex-1 rounded-full border text-xs font-medium tabular-nums transition-colors",
                    size === s ? "border-ink bg-ink text-cream" : "bg-card hover:bg-secondary"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => onAction({ kind: "copy", format: "png" })} disabled={!!busy}>
                {spin("copy", "png")} Copiar
              </Button>
              <Button variant="outline" onClick={() => onAction({ kind: "download", format: "png" })} disabled={!!busy}>
                {spin("download", "png")} Descargar
              </Button>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Cada formato cuenta como una descarga del plan de Magnific (una sola vez: después queda guardado en esta página).
        </p>
      </DialogContent>
    </Dialog>
  );
}
