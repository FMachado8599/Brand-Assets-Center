"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildGroups, readFiles } from "@/lib/gif/parse";
import { renderGif, renderSignature, saveBlob, zipGifs, type RenderedGif } from "@/lib/gif/encode";
import type { Frame, GifGroup, GifSettings, InvalidFile } from "@/lib/gif/types";

type Render = RenderedGif & { sig: string; url: string };

/**
 * Estado del módulo GIF: los frames subidos, los archivos que no se pudieron
 * leer y los GIF ya generados (que se reutilizan mientras no cambie nada que
 * afecte el resultado).
 */
export function useGifProject(settings: GifSettings) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [invalid, setInvalid] = useState<InvalidFile[]>([]);
  const [renders, setRenders] = useState<Record<string, Render>>({});
  const [rendering, setRendering] = useState<Set<string>>(new Set());
  const groups = useMemo(() => buildGroups(frames), [frames]);

  // Para liberar las URLs locales al salir de la página.
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const tracked = urls.current;
    return () => tracked.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const release = (url?: string) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  };

  /** Suma archivos a los que ya hay. Si llega uno con el mismo nombre, reemplaza al anterior. */
  const addFiles = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (!files.length) return;
    const read = await readFiles(files);
    read.frames.forEach((f) => urls.current.add(f.url));
    read.invalid.forEach((f) => f.url && urls.current.add(f.url));
    const names = new Set(files.map((f) => f.name));

    setFrames((prev) => {
      prev.filter((f) => names.has(f.filename)).forEach((f) => release(f.url));
      return [...prev.filter((f) => !names.has(f.filename)), ...read.frames];
    });
    setInvalid((prev) => {
      prev.filter((f) => names.has(f.filename)).forEach((f) => release(f.url));
      return [...prev.filter((f) => !names.has(f.filename)), ...read.invalid];
    });
  }, []);

  const removeFrame = useCallback((id: string) => {
    setFrames((prev) => {
      release(prev.find((f) => f.id === id)?.url);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const removeInvalid = useCallback((id: string) => {
    setInvalid((prev) => {
      release(prev.find((f) => f.id === id)?.url);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    setFrames([]);
    setInvalid([]);
    setRenders({});
  }, []);

  /** Duración propia de un frame en ms (null vuelve a la de por defecto). */
  const setDuration = useCallback((id: string, durationMs: number | null) => {
    setFrames((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, durationMs, durationSource: durationMs === null ? "default" : "manual" } : f
      )
    );
  }, []);

  /** Mueve un frame un lugar dentro de su grupo y renumera el grupo 1, 2, 3… */
  const moveFrame = useCallback((id: string, direction: -1 | 1) => {
    setFrames((prev) => {
      const frame = prev.find((f) => f.id === id);
      if (!frame) return prev;
      const group = prev
        .filter((f) => f.groupKey === frame.groupKey)
        .sort((a, b) => a.order - b.order || a.filename.localeCompare(b.filename));
      const index = group.findIndex((f) => f.id === id);
      const target = index + direction;
      if (target < 0 || target >= group.length) return prev;
      [group[index], group[target]] = [group[target], group[index]];
      const orders = new Map(group.map((f, i) => [f.id, i + 1]));
      return prev.map((f) => (orders.has(f.id) ? { ...f, order: orders.get(f.id)! } : f));
    });
  }, []);

  const render = useCallback(
    async (group: GifGroup): Promise<Blob> => {
      const sig = renderSignature(group, settings);
      const cached = renders[group.key];
      if (cached?.sig === sig) return cached.blob;

      setRendering((prev) => new Set(prev).add(group.key));
      try {
        const result = await renderGif(group, settings);
        const url = URL.createObjectURL(result.blob);
        urls.current.add(url);
        setRenders((prev) => {
          release(prev[group.key]?.url);
          return { ...prev, [group.key]: { ...result, sig, url } };
        });
        return result.blob;
      } finally {
        setRendering((prev) => {
          const next = new Set(prev);
          next.delete(group.key);
          return next;
        });
      }
    },
    [renders, settings]
  );

  /** El GIF ya generado de un grupo, solo si sigue vigente con los ajustes actuales. */
  const renderOf = useCallback(
    (group: GifGroup) => {
      const r = renders[group.key];
      return r && r.sig === renderSignature(group, settings) ? r : null;
    },
    [renders, settings]
  );

  const downloadGroup = useCallback(
    async (group: GifGroup) => saveBlob(await render(group), `${group.name}.gif`),
    [render]
  );

  const downloadZip = useCallback(
    async (list: GifGroup[], onProgress?: (done: number) => void) => {
      const files: { name: string; blob: Blob }[] = [];
      for (const group of list) {
        files.push({ name: group.name, blob: await render(group) });
        onProgress?.(files.length);
      }
      const date = new Date().toISOString().slice(0, 10);
      saveBlob(await zipGifs(files), `gifs-${date}.zip`);
    },
    [render]
  );

  return {
    frames,
    invalid,
    groups,
    rendering,
    addFiles,
    removeFrame,
    removeInvalid,
    clear,
    setDuration,
    moveFrame,
    render,
    renderOf,
    downloadGroup,
    downloadZip,
  };
}
