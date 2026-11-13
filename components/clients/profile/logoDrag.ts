"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";

/**
 * Arrastrar en la sección Logos: archivos desde la compu (para subirlos) y logos de la lista
 * (para cambiarlos de grupo o de lugar). Un logo se marca con un tipo propio para no confundirlo
 * con un archivo, y sin text/plain para que no se pueda soltar como texto en un campo.
 */
const LOGO_TYPE = "application/x-brand-logo";

const isFileDrag = (e: DragEvent) => [...e.dataTransfer.types].includes("Files");
const isLogoDrag = (e: DragEvent) => [...e.dataTransfer.types].includes(LOGO_TYPE);

export function startLogoDrag(e: DragEvent, id: string) {
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData(LOGO_TYPE, id);
}

export type DropKind = "files" | "logo";

/**
 * Un lugar donde soltar archivos, logos o las dos cosas. `over` dice qué hay encima, para
 * resaltarlo. Cuenta las entradas y salidas porque pasar por encima de un hijo dispara un
 * dragleave en el padre; y se limpia con cualquier drop de la página, porque si se suelta en un
 * hijo que también recibe (un logo adentro de un grupo), el padre no se entera.
 */
export function useDropZone({ onFiles, onLogo }: { onFiles?: (files: File[]) => void; onLogo?: (id: string) => void }) {
  const depth = useRef(0);
  const [over, setOver] = useState<DropKind | null>(null);

  useEffect(() => {
    const reset = () => {
      depth.current = 0;
      setOver(null);
    };
    window.addEventListener("drop", reset, true);
    window.addEventListener("dragend", reset, true);
    return () => {
      window.removeEventListener("drop", reset, true);
      window.removeEventListener("dragend", reset, true);
    };
  }, []);

  const kindOf = (e: DragEvent): DropKind | null =>
    onFiles && isFileDrag(e) ? "files" : onLogo && isLogoDrag(e) ? "logo" : null;

  const handlers = {
    onDragEnter: (e: DragEvent) => {
      const kind = kindOf(e);
      if (!kind) return;
      e.preventDefault();
      depth.current++;
      setOver(kind);
    },
    onDragOver: (e: DragEvent) => {
      const kind = kindOf(e);
      if (!kind) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = kind === "files" ? "copy" : "move";
    },
    onDragLeave: (e: DragEvent) => {
      if (!kindOf(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(null);
    },
    onDrop: (e: DragEvent) => {
      const kind = kindOf(e);
      if (!kind) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setOver(null);
      if (kind === "files") {
        const files = [...e.dataTransfer.files];
        if (files.length) onFiles?.(files);
      } else {
        const id = e.dataTransfer.getData(LOGO_TYPE);
        if (id) onLogo?.(id);
      }
    },
  };

  return { over, handlers };
}
