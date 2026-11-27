"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toaster";
import { extractText } from "@/lib/clients/extract";
import {
  MATERIAL_MAX_FILES,
  displayName,
  formatWords,
  guessKind,
  materialProblem,
  wordsOf,
} from "@/lib/clients/material";
import { isMissingMaterialMigration, materialErrorMessage, materialsRepo, type MaterialPatch } from "@/lib/repos/materials";
import type { BrandMaterial, MaterialKind } from "@/lib/types";
import { invalidarMaterialMarca } from "./useMaterialMarca";

/** Un archivo que se está sumando (o que no se pudo), para mostrarlo en la lista mientras tanto. */
export type Upload = { key: string; name: string; stage: "leyendo" | "subiendo" | "error"; error?: string };

/**
 * El material de marca de un cliente: la lista, sumar archivos (se les lee el texto en el navegador y
 * se suben directo al almacenamiento), cambiarlos y borrarlos. Cada cambio avisa a la IA de Redacción
 * que tiene que volver a leer el material de ese cliente.
 */
export function useBrandMaterials(brandId: string) {
  const [items, setItems] = useState<BrandMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  /** Falta correr supabase/migracion-material.sql. */
  const [missing, setMissing] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const current = useRef(brandId);
  current.current = brandId;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const load = useCallback(async () => {
    const { data, error } = await materialsRepo.list(brandId);
    if (current.current !== brandId) return;
    if (error) {
      setMissing(isMissingMaterialMigration(error.message));
      if (!isMissingMaterialMigration(error.message)) toast(materialErrorMessage(error), "error");
    } else {
      setMissing(false);
      setItems(data ?? []);
    }
    setLoading(false);
  }, [brandId]);

  useEffect(() => {
    setItems([]);
    setUploads([]);
    setMissing(false);
    setLoading(true);
    load();
  }, [load]);

  const patchUpload = (key: string, patch: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const dismissUpload = useCallback((key: string) => setUploads((list) => list.filter((u) => u.key !== key)), []);

  /** Suma archivos de a uno. `kind` fuerza el tipo (ej: estando en la pestaña Logos); si no, se adivina por el archivo. */
  const addFiles = useCallback(
    async (files: File[], kind?: MaterialKind) => {
      const room = MATERIAL_MAX_FILES - itemsRef.current.length;
      const valid: File[] = [];
      for (const file of files) {
        const problem = materialProblem(file);
        if (problem) toast(problem, "error");
        else valid.push(file);
      }
      if (valid.length > room) {
        toast(`Un cliente puede tener hasta ${MATERIAL_MAX_FILES} archivos de material`, "error");
        valid.length = Math.max(room, 0);
      }
      if (!valid.length) return;

      const batch = valid.map((file) => ({ file, key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }));
      setUploads((list) => [...batch.map(({ file, key }) => ({ key, name: file.name, stage: "leyendo" as const })), ...list]);

      let added = 0;
      let readWords = 0;
      const unreadable: string[] = [];
      for (const { file, key } of batch) {
        let text = "";
        try {
          text = (await extractText(file)) ?? "";
        } catch {
          unreadable.push(file.name);
        }
        patchUpload(key, { stage: "subiendo" });
        const { data, error } = await materialsRepo.add(brandId, file, {
          kind: kind ?? guessKind(file),
          name: displayName(file.name),
          text,
        });
        if (error || !data) {
          patchUpload(key, { stage: "error", error: error ? materialErrorMessage(error) : "No se pudo subir" });
          if (error && isMissingMaterialMigration(error.message)) setMissing(true);
          continue;
        }
        added++;
        readWords += wordsOf(data.text_chars);
        dismissUpload(key);
        if (current.current === brandId) setItems((list) => [data, ...list.filter((i) => i.id !== data.id)]);
      }

      if (added) {
        invalidarMaterialMarca(brandId);
        const base = added === 1 ? "Sumé 1 archivo" : `Sumé ${added} archivos`;
        toast(readWords ? `${base} · la IA ya puede leer ${formatWords(readWords * 6)}` : base);
      }
      if (unreadable.length) {
        toast(
          `No pude leer el texto de ${unreadable.length === 1 ? `«${unreadable[0]}»` : `${unreadable.length} archivos`} (se guardó igual)`,
          "error"
        );
      }
    },
    [brandId, dismissUpload]
  );

  /** Cambia un archivo: se ve al instante y, si la base dice que no, vuelve a como estaba. */
  const update = useCallback(
    async (id: string, patch: MaterialPatch) => {
      const before = itemsRef.current.find((i) => i.id === id);
      if (!before) return false;
      setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      const { data, error } = await materialsRepo.update(id, patch);
      if (error || !data) {
        setItems((list) => list.map((i) => (i.id === id ? before : i)));
        toast(error ? materialErrorMessage(error) : "No se pudo guardar", "error");
        return false;
      }
      setItems((list) => list.map((i) => (i.id === id ? data : i)));
      invalidarMaterialMarca(brandId);
      return true;
    },
    [brandId]
  );

  const remove = useCallback(
    async (item: BrandMaterial) => {
      const { error } = await materialsRepo.remove(item);
      if (error) {
        toast(materialErrorMessage(error), "error");
        return false;
      }
      setItems((list) => list.filter((i) => i.id !== item.id));
      invalidarMaterialMarca(brandId);
      return true;
    },
    [brandId]
  );

  return { items, loading, missing, uploads, dismissUpload, addFiles, update, remove, reload: load };
}
