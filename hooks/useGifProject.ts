"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildGroups, byOrder, cleanGifName, readFiles } from "@/lib/gif/parse";
import { renderGif, renderSignature, saveBlob, zipGifs, type RenderedGif } from "@/lib/gif/encode";
import type { Frame, GifGroup, GifSettings, InvalidFile } from "@/lib/gif/types";

type Render = RenderedGif & { sig: string; url: string };

/** Los frames de un grupo, en orden. */
const framesOf = (frames: Frame[], key: string) => frames.filter((f) => f.groupKey === key).sort(byOrder);

/**
 * Le da a cada frame de la lista el lugar que ocupa (1, 2, 3…) y, si se pasa, la clave y el nombre del
 * grupo. Al ordenar a mano el orden deja de salir del nombre, así que dejan de valer los avisos de
 * «falta el frame 2».
 */
function place(frames: Frame[], ordered: Frame[], group?: { key: string; name: string }) {
  const at = new Map(ordered.map((f, i) => [f.id, i + 1]));
  return frames.map((f) =>
    at.has(f.id)
      ? { ...f, order: at.get(f.id), ...(group && { groupKey: group.key, groupName: group.name }) }
      : f
  );
}

/**
 * Estado del módulo GIF: los frames subidos, los archivos que no se pudieron leer y los GIF ya
 * generados (que se reutilizan mientras no cambie nada que afecte el resultado).
 *
 * Un grupo de dos frames o más es un GIF; uno de un solo frame es una imagen suelta, que se agrupa
 * a mano soltándola sobre otra o sobre un GIF.
 */
export function useGifProject(settings: GifSettings) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [invalid, setInvalid] = useState<InvalidFile[]>([]);
  const [renders, setRenders] = useState<Record<string, Render>>({});
  const [rendering, setRendering] = useState<Set<string>>(new Set());

  const all = useMemo(() => buildGroups(frames), [frames]);
  const groups = useMemo(() => all.filter((g) => g.frames.length > 1), [all]);
  const loose = useMemo(
    () =>
      all
        .filter((g) => g.frames.length === 1)
        .map((g) => g.frames[0])
        .sort((a, b) => a.filename.localeCompare(b.filename, "es", { numeric: true })),
    [all]
  );

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
      const kept = prev.filter((f) => !names.has(f.filename));
      // Si el GIF ya tiene nombre propio (renombrado o armado a mano), los frames nuevos lo toman.
      const named = new Map(kept.map((f) => [f.groupKey, f.groupName]));
      return [...kept, ...read.frames.map((f) => (named.has(f.groupKey) ? { ...f, groupName: named.get(f.groupKey) } : f))];
    });
    setInvalid((prev) => {
      prev.filter((f) => names.has(f.filename)).forEach((f) => release(f.url));
      return [...prev.filter((f) => !names.has(f.filename)), ...read.invalid];
    });
  }, []);

  const removeFrame = useCallback((id: string) => {
    setFrames((prev) => {
      const frame = prev.find((f) => f.id === id);
      if (!frame) return prev;
      release(frame.url);
      const rest = prev.filter((f) => f.id !== id);
      return place(rest, framesOf(rest, frame.groupKey));
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

  /** Pone un frame en otro lugar de su grupo (0 = primero) y renumera el grupo 1, 2, 3… */
  const moveFrame = useCallback((id: string, to: number) => {
    setFrames((prev) => {
      const frame = prev.find((f) => f.id === id);
      if (!frame) return prev;
      const group = framesOf(prev, frame.groupKey);
      const from = group.findIndex((f) => f.id === id);
      const target = Math.max(0, Math.min(group.length - 1, to));
      if (from === target) return prev;
      group.splice(from, 1);
      group.splice(target, 0, frame);
      return place(prev, group);
    });
  }, []);

  /**
   * Suma frames a un grupo, al final o en el lugar que se pida. Sirve para soltar una imagen sobre
   * un GIF, y para armar uno nuevo con imágenes sueltas (el grupo de destino es el de la primera).
   */
  const addToGroup = useCallback((ids: string[], key: string, at?: number) => {
    setFrames((prev) => {
      const target = framesOf(prev, key);
      if (!target.length) return prev;
      const moving = ids.map((id) => prev.find((f) => f.id === id)).filter((f) => f && f.groupKey !== key);
      if (!moving.length) return prev;
      const ordered = [...target];
      ordered.splice(at ?? ordered.length, 0, ...moving);
      const sources = new Set(moving.map((f) => f.groupKey));
      let next = place(prev, ordered, { key, name: target[0].groupName });
      // Los grupos de donde salieron quedan sin huecos en el orden.
      for (const source of sources) next = place(next, framesOf(next, source));
      return next;
    });
  }, []);

  /** Saca un frame de su GIF: queda suelta, con su nombre de antes. */
  const ungroup = useCallback((id: string) => {
    setFrames((prev) => {
      const frame = prev.find((f) => f.id === id);
      if (!frame) return prev;
      const next = prev.map((f) =>
        f.id === id ? { ...f, groupKey: `suelta:${crypto.randomUUID()}`, groupName: f.ownName, order: 1 } : f
      );
      return place(next, framesOf(next, frame.groupKey));
    });
  }, []);

  /** Cambia el nombre del GIF (el del archivo que se descarga). Vacío no hace nada. */
  const rename = useCallback((key: string, name: string) => {
    const clean = cleanGifName(name);
    if (!clean) return;
    setFrames((prev) => prev.map((f) => (f.groupKey === key ? { ...f, groupName: clean } : f)));
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
    /** Todos los grupos, también los de un solo frame: el diálogo sigue abierto aunque quede uno. */
    all,
    /** Los GIF: grupos de dos frames o más. */
    groups,
    /** Las imágenes sueltas: las que no están en ningún GIF. */
    loose,
    rendering,
    addFiles,
    removeFrame,
    removeInvalid,
    clear,
    setDuration,
    moveFrame,
    addToGroup,
    ungroup,
    rename,
    render,
    renderOf,
    downloadGroup,
    downloadZip,
  };
}
