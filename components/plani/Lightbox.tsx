"use client";

import { useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { Medio } from "@/lib/plani/types";
import { esVideo, useMedioUrl } from "./bits";

/**
 * Una imagen (o video) en grande, sobre negro, con flechas para pasar a la siguiente del mismo
 * grupo. Esc cierra; ← y → navegan.
 */
export function Lightbox({
  medios,
  index,
  onIndex,
  onClose,
  caption,
}: {
  medios: Medio[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  caption?: (m: Medio) => string;
}) {
  const medioUrl = useMedioUrl();
  const open = index !== null && !!medios[index];
  const m = open ? medios[index!] : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && index! < medios.length - 1) onIndex(index! + 1);
      if (e.key === "ArrowLeft" && index! > 0) onIndex(index! - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, medios.length, onIndex]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-ink/95 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-0 z-[60] flex flex-col outline-none" aria-describedby={undefined}>
          <DialogPrimitive.Title className="sr-only">{m?.nombre ?? "Imagen"}</DialogPrimitive.Title>
          <div className="flex items-center gap-2 p-3 text-cream">
            <span className="min-w-0 flex-1 truncate px-2 text-sm text-cream/70">
              {m && (caption ? caption(m) : m.nombre)}
              {medios.length > 1 && <span className="ml-2 tabular-nums text-cream/45">{index! + 1} / {medios.length}</span>}
            </span>
            {m && (
              <a
                href={`${medioUrl(m)}?descargar=1`}
                className="grid h-10 w-10 place-items-center rounded-full text-cream/70 hover:bg-cream/10 hover:text-cream"
                aria-label="Descargar"
              >
                <Download className="h-5 w-5" />
              </a>
            )}
            <DialogPrimitive.Close className="grid h-10 w-10 place-items-center rounded-full text-cream/70 hover:bg-cream/10 hover:text-cream" aria-label="Cerrar">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6 sm:px-16" onClick={onClose}>
            {m &&
              (esVideo(m) ? (
                <video key={m.id} src={medioUrl(m)} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={m.id}
                  src={medioUrl(m, 2000)}
                  alt={m.nombre}
                  className="max-h-full max-w-full rounded-lg object-contain duration-300 animate-in fade-in-0 zoom-in-95"
                  onClick={(e) => e.stopPropagation()}
                />
              ))}
            {index !== null && index > 0 && (
              <button
                type="button"
                aria-label="Anterior"
                onClick={(e) => {
                  e.stopPropagation();
                  onIndex(index - 1);
                }}
                className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-cream/10 text-cream hover:bg-cream/20 sm:left-4"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            {index !== null && index < medios.length - 1 && (
              <button
                type="button"
                aria-label="Siguiente"
                onClick={(e) => {
                  e.stopPropagation();
                  onIndex(index + 1);
                }}
                className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-cream/10 text-cream hover:bg-cream/20 sm:right-4"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
