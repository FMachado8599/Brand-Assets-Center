"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FontFace } from "@/lib/types";
import { readFontFile, MAX_INSTANCES, fullFontName, type FontInstance } from "@/lib/fonts/fontfile";

export type QueuedFace = FontInstance & { include: boolean };

export type QueuedFile = {
  key: string;
  file: File;
  blobUrl: string;
  family: string;
  isVariable: boolean;
  fromFile: boolean;
  faces: QueuedFace[];
};

export type QueueGroup = {
  family: string;
  rows: { file: QueuedFile; index: number; face: QueuedFace }[];
  isVariable: boolean;
  guessed: boolean;
  selected: number;
};

const PREVIEW_STYLE_ID = "tarjetas-preview-fonts";

/** Familia temporal para previsualizar sin pisar las ya guardadas. */
export const previewFamily = (fileKey: string, index: number) => `pv-${fileKey}-${index}`;

/**
 * Toda la lógica de la cola de subida: leer los archivos, agruparlos por
 * familia, detectar choques de nombre y previsualizar cada peso con su
 * archivo real. El componente que la usa solo dibuja.
 */
export function useFontQueue(fonts: FontFace[]) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [reading, setReading] = useState(false);

  /* Familias ya existentes, sin distinguir mayúsculas: si subís
     "MONTSERRAT-BOLD.TTF" y en la base hay "Montserrat", se unifica. */
  const existingFamilies = useMemo(() => {
    const map = new Map<string, string>();
    fonts.forEach((f) => map.set(f.family.toLowerCase(), f.family));
    return map;
  }, [fonts]);

  const existingNames = useMemo(() => new Set(fonts.map((f) => f.full_name)), [fonts]);

  /* Previsualización: cada peso pendiente se registra con su propio archivo,
     fijando el eje wght cuando es variable. */
  useEffect(() => {
    let el = document.getElementById(PREVIEW_STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = PREVIEW_STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = queue
      .flatMap((f) =>
        f.faces.map((face, i) => {
          const pin = f.isVariable ? `font-variation-settings:"wght" ${face.weight};` : "";
          const weight = f.isVariable ? `${face.weight}` : "1 1000";
          return `@font-face{font-family:"${previewFamily(f.key, i)}";src:url("${f.blobUrl}");font-weight:${weight};font-style:${face.italic ? "italic" : "normal"};${pin}}`;
        })
      )
      .join("\n");
  }, [queue]);

  useEffect(() => () => document.getElementById(PREVIEW_STYLE_ID)?.remove(), []);

  /* Los archivos nuevos se SUMAN a la cola, no la reemplazan. */
  const add = useCallback(
    async (files: FileList | File[] | null) => {
      const list = files ? Array.from(files) : [];
      if (!list.length) return;
      setReading(true);

      const known = new Map(existingFamilies);
      queue.forEach((f) => known.set(f.family.toLowerCase(), f.family));
      const added: QueuedFile[] = [];

      for (const file of list) {
        const meta = await readFontFile(file);
        const family = known.get(meta.family.toLowerCase()) || meta.family;
        known.set(family.toLowerCase(), family);
        added.push({
          key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          blobUrl: URL.createObjectURL(file),
          family,
          isVariable: meta.isVariable,
          fromFile: meta.fromFile,
          faces: meta.instances.slice(0, MAX_INSTANCES).map((i) => ({ ...i, include: true })),
        });
      }

      setQueue((prev) => [...prev, ...added]);
      setReading(false);
    },
    [existingFamilies, queue]
  );

  const dropFile = useCallback((key: string) => {
    setQueue((prev) => {
      prev.filter((f) => f.key === key).forEach((f) => URL.revokeObjectURL(f.blobUrl));
      return prev.filter((f) => f.key !== key);
    });
  }, []);

  const clear = useCallback(() => {
    setQueue((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.blobUrl));
      return [];
    });
  }, []);

  const toggleFace = useCallback((key: string, index: number) => {
    setQueue((prev) =>
      prev.map((f) =>
        f.key === key
          ? { ...f, faces: f.faces.map((face, i) => (i === index ? { ...face, include: !face.include } : face)) }
          : f
      )
    );
  }, []);

  const renameFamily = useCallback((from: string, to: string) => {
    setQueue((prev) => prev.map((f) => (f.family === from ? { ...f, family: to } : f)));
  }, []);

  const setFamilyInclude = useCallback((family: string, include: boolean) => {
    setQueue((prev) =>
      prev.map((f) => (f.family === family ? { ...f, faces: f.faces.map((face) => ({ ...face, include })) } : f))
    );
  }, []);

  /* La cola se muestra agrupada por familia: 20 archivos son una tarjeta. */
  const groups = useMemo<QueueGroup[]>(() => {
    const map = new Map<string, QueueGroup>();
    queue.forEach((file) =>
      file.faces.forEach((face, index) => {
        const g =
          map.get(file.family) ||
          { family: file.family, rows: [], isVariable: false, guessed: false, selected: 0 };
        g.rows.push({ file, index, face });
        g.isVariable = g.isVariable || file.isVariable;
        g.guessed = g.guessed || !file.fromFile;
        if (face.include) g.selected++;
        map.set(file.family, g);
      })
    );
    for (const g of map.values()) {
      g.rows.sort((a, b) => a.face.weight - b.face.weight || Number(a.face.italic) - Number(b.face.italic));
    }
    return Array.from(map.values()).sort((a, b) => a.family.localeCompare(b.family));
  }, [queue]);

  /** Cuántas veces se repite cada nombre final: sirve para avisar de choques. */
  const plannedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    queue.forEach((f) =>
      f.faces.forEach((face) => {
        if (!face.include) return;
        const name = fullFontName(f.family, face.styleName);
        counts.set(name, (counts.get(name) || 0) + 1);
      })
    );
    return counts;
  }, [queue]);

  const hasDuplicates = useMemo(
    () => Array.from(plannedCounts.values()).some((n) => n > 1),
    [plannedCounts]
  );

  const conflicts = useCallback(
    (name: string) => (plannedCounts.get(name) || 0) > 1 || existingNames.has(name),
    [plannedCounts, existingNames]
  );

  const totalSelected = queue.reduce((n, f) => n + f.faces.filter((x) => x.include).length, 0);

  return {
    queue, groups, reading, totalSelected, hasDuplicates,
    add, dropFile, clear, toggleFace, renameFamily, setFamilyInclude,
    conflicts, existingFamilies, existingNames,
  };
}
