"use client";

import { useEffect, useState } from "react";

/** Estado de cada imagen ya pedida en esta pestaña: true = cargó, false = falló. */
const status = new Map<string, boolean>();
const inFlight = new Map<string, Promise<void>>();

/** Si una imagen no responde, no puede trabar a toda su página. */
const GIVE_UP_MS = 8000;

function preload(url: string): Promise<void> {
  if (status.has(url)) return Promise.resolve();
  let pending = inFlight.get(url);
  if (!pending) {
    pending = new Promise<void>((resolve) => {
      const settle = (ok: boolean) => {
        if (!status.has(url)) status.set(url, ok);
        inFlight.delete(url);
        resolve();
      };
      const img = new Image();
      img.decoding = "async";
      // decode(): que esté lista para pintarse, no solo descargada.
      img.onload = () => img.decode().then(() => settle(true), () => settle(true));
      img.onerror = () => settle(false);
      img.src = url;
      setTimeout(() => settle(true), GIVE_UP_MS);
    });
    inFlight.set(url, pending);
  }
  return pending;
}

export function isBroken(url: string) {
  return status.get(url) === false;
}

/**
 * Próximo frame de pintado. En una pestaña oculta el navegador frena
 * requestAnimationFrame, así que ahí se usa un timeout: la grilla queda lista
 * para cuando vuelvas, en lugar de recién empezar a aparecer.
 */
function nextFrame(fn: () => void): () => void {
  if (document.hidden) {
    const timer = setTimeout(fn, 0);
    return () => clearTimeout(timer);
  }
  const frame = requestAnimationFrame(fn);
  return () => cancelAnimationFrame(frame);
}

/**
 * Cuántos elementos de la lista ya se pueden mostrar; el resto se ve como esqueleto.
 *
 *  - "batch": cada página aparece entera, de una, cuando cargaron todas sus imágenes.
 *  - "ordered": aparecen de a uno y siempre en orden (izquierda a derecha, arriba a
 *    abajo): un emoji no se muestra hasta que todos los anteriores ya se mostraron.
 */
export function useImageReveal(
  urls: string[],
  batches: number[],
  mode: "batch" | "ordered",
  resetKey: string
): number {
  const [, setTick] = useState(0);
  const [cursor, setCursor] = useState({ key: resetKey, n: 0 });

  // Pide todas las imágenes de la lista; cada vez que termina una (agrupadas por frame) se recalcula.
  useEffect(() => {
    let alive = true;
    let cancel: (() => void) | null = null;
    const bump = () => {
      if (cancel) return;
      cancel = nextFrame(() => {
        cancel = null;
        if (alive) setTick((t) => t + 1);
      });
    };
    for (const url of urls) if (!status.has(url)) preload(url).then(bump);
    return () => {
      alive = false;
      cancel?.();
    };
  }, [urls]);

  // Al volver a la pestaña, retoma la aparición donde había quedado.
  useEffect(() => {
    const onVisible = () => setTick((t) => t + 1);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const ready = (i: number) => status.has(urls[i]);
  const shownOrdered = cursor.key === resetKey ? Math.min(cursor.n, urls.length) : 0;

  // Modo ordenado: avanza de a un emoji por frame, y solo si el siguiente ya cargó.
  useEffect(() => {
    if (mode !== "ordered" || shownOrdered >= urls.length || !status.has(urls[shownOrdered])) return;
    if (document.hidden) {
      // Nadie está mirando: se muestra de una todo lo que ya cargó (en orden), sin animar.
      let n = shownOrdered;
      while (n < urls.length && status.has(urls[n])) n++;
      setCursor({ key: resetKey, n });
      return;
    }
    return nextFrame(() => setCursor({ key: resetKey, n: shownOrdered + 1 }));
  });

  if (mode === "ordered") return shownOrdered;

  let shown = 0;
  for (const end of batches) {
    const stop = Math.min(end, urls.length);
    for (let i = shown; i < stop; i++) if (!ready(i)) return shown;
    shown = stop;
  }
  return shown;
}
