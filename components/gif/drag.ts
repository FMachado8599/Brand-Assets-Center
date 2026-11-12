"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent } from "react";

/**
 * Arrastrar frames dentro de la página (no archivos desde la compu). Se marca con un tipo propio
 * para no confundirlo con soltar archivos, y sin text/plain para que no se pueda soltar como texto
 * en un campo.
 */
const FRAME_TYPE = "application/x-gif-frame";

export const isFileDrag = (e: DragEvent) => [...e.dataTransfer.types].includes("Files");
const isFrameDrag = (e: DragEvent) => [...e.dataTransfer.types].includes(FRAME_TYPE);

export type FrameDrag = {
  /** El frame que se está arrastrando, o null. */
  id: string | null;
  start: (e: DragEvent, id: string) => void;
  end: () => void;
};

export function useFrameDrag(): FrameDrag {
  const [id, setId] = useState<string | null>(null);
  const start = useCallback((e: DragEvent, frameId: string) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(FRAME_TYPE, frameId);
    // Después de que el navegador saca la «foto» del arrastre: si cambia la página antes, Chrome a veces lo corta.
    setTimeout(() => setId(frameId), 0);
  }, []);
  const end = useCallback(() => setId(null), []);
  return { id, start, end };
}

/**
 * Un lugar donde soltar un frame. `over` dice si hay uno encima, para resaltarlo. Cuenta las
 * entradas y salidas porque pasar por encima de un hijo dispara un dragleave en el padre.
 */
export function useFrameDrop(enabled: boolean, onDrop: () => void) {
  const depth = useRef(0);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (enabled) return;
    depth.current = 0;
    setOver(false);
  }, [enabled]);

  const handlers = {
    onDragEnter: (e: DragEvent) => {
      if (!enabled || !isFrameDrag(e)) return;
      e.preventDefault();
      depth.current++;
      setOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!enabled || !isFrameDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    onDragLeave: (e: DragEvent) => {
      if (!enabled || !isFrameDrag(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      if (!enabled || !isFrameDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setOver(false);
      onDrop();
    },
  };

  return { over: enabled && over, handlers };
}

/**
 * Las filas que se arrastran no tienen `draggable` fijo: se activa al apretar fuera de un campo o
 * un botón, así se puede seleccionar el texto de la duración sin arrastrar la fila.
 */
export function armDrag(e: PointerEvent<HTMLElement>) {
  e.currentTarget.draggable = !(e.target as HTMLElement).closest("input, button, textarea");
}
