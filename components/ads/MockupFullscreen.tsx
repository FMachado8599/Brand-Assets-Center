"use client";

import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { PHONE } from "./draw";
import { MockupView, type MockupViewProps } from "./MockupView";

/** Lo que el teléfono deja libre en pantalla completa: arriba el título y la X, a los costados un poco de aire. */
const MARGIN = { x: 32, y: 112 };

const fitScale = () => Math.min((window.innerHeight - MARGIN.y) / PHONE.h, (window.innerWidth - MARGIN.x) / PHONE.w);

export type FullscreenMockup = { title: string; note?: string | null; mockup: Omit<MockupViewProps, "scale" | "onSource"> };

/**
 * Un mockup en grande, sobre un fondo oscuro, del tamaño que entre en la ventana. Se cierra con la X, tocando
 * afuera del teléfono o con Esc. Lo que se ve es el mismo dibujo que en la fila (en un carrusel, con sus flechas).
 */
export function MockupFullscreen({ shown, onClose }: { shown: FullscreenMockup | null; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  // Mientras se cierra (la animación de salida) sigue mostrando el último.
  const last = useRef(shown);
  if (shown) last.current = shown;
  const view = shown ?? last.current;
  const open = !!shown;

  useEffect(() => {
    if (!open) return;
    const update = () => setScale(fitScale());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Toda la ventana: un click en el fondo (no en el teléfono) cierra.
          onClick={(e) => e.target === e.currentTarget && onClose()}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-4 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {view && (
            <>
              <DialogPrimitive.Title className="text-center text-sm font-medium text-white">
                {view.title}
                {view.note && <span className="block text-xs font-normal text-amber-300">{view.note}</span>}
              </DialogPrimitive.Title>
              <MockupView {...view.mockup} scale={scale} />
            </>
          )}
          <DialogPrimitive.Close className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white outline-none ring-white/60 transition hover:bg-white/20 focus-visible:ring-2">
            <X className="h-5 w-5" />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
