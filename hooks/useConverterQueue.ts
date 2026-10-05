"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildOptions,
  extensionOf,
  getOptionSchema,
  getTargets,
  pickDefaultTarget,
  type Operation,
  type OptionValues,
  type Targets,
} from "@/lib/converter/catalog";

export type ItemStatus = "loading" | "ready" | "unsupported" | "uploading" | "processing" | "done" | "error";

export type QueueItem = {
  id: string;
  file: File;
  input: string;
  targets: Targets | null;
  output?: string;
  options: OptionValues;
  status: ItemStatus;
  /** 0–100 durante la subida. */
  progress: number;
  error?: string;
  url?: string;
};

const POLL_MS = 2000;
const TIMEOUT_MS = 30 * 60 * 1000;

export const isBusy = (s: ItemStatus) => s === "uploading" || s === "processing";

export type QueueSettings = {
  /** Archivos que se procesan a la vez (1–3). */
  concurrency: number;
  /** Formato de salida preferido por familia (image, video…) para los archivos nuevos. */
  preferred: Record<string, string | undefined>;
};

export function useConverterQueue(operation: Operation, settings: QueueSettings) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const operationRef = useRef(operation);
  operationRef.current = operation;
  // Ref y no dependencia: cambiar una preferencia no debe recalcular los archivos que ya están en la lista.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const patch = useCallback((id: string, p: Partial<QueueItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }, []);

  const resolveTargets = useCallback(
    async (id: string, input: string) => {
      try {
        const targets = input ? await getTargets(operation, input) : null;
        if (operationRef.current !== operation) return; // el modo cambió mientras esperábamos
        if (!targets) return patch(id, { status: "unsupported", targets: null, error: "Formato no soportado" });
        const output = pickDefaultTarget(targets, operation, input, settingsRef.current.preferred);
        patch(id, { status: "ready", targets, output, options: {} });
      } catch {
        patch(id, { status: "error", error: "No se pudieron leer los formatos disponibles" });
      }
    },
    [operation, patch]
  );

  // Al cambiar entre convertir y comprimir, los formatos posibles cambian: se recalculan los pendientes.
  useEffect(() => {
    for (const i of itemsRef.current) {
      if (i.status === "ready" || i.status === "unsupported" || i.status === "loading") {
        patch(i.id, { status: "loading", error: undefined });
        resolveTargets(i.id, i.input);
      }
    }
  }, [operation, patch, resolveTargets]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const added = Array.from(files).map<QueueItem>((file) => ({
        id: crypto.randomUUID(),
        file,
        input: extensionOf(file.name),
        targets: null,
        options: {},
        status: "loading",
        progress: 0,
      }));
      setItems((prev) => [...prev, ...added]);
      added.forEach((i) => resolveTargets(i.id, i.input));
    },
    [resolveTargets]
  );

  const remove = useCallback((id: string) => setItems((prev) => prev.filter((i) => i.id !== id)), []);
  const clear = useCallback(() => setItems((prev) => prev.filter((i) => isBusy(i.status))), []);

  const setOutput = useCallback((id: string, output: string) => patch(id, { output, options: {} }), [patch]);
  const setOptions = useCallback((id: string, options: OptionValues) => patch(id, { options }), [patch]);

  /** "Convertir todo a…": aplica el formato a cada archivo que lo admita. */
  const setAllOutputs = useCallback((output: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.status === "ready" && i.targets && Object.values(i.targets.groups).flat().some((t) => t.slug === output)
          ? { ...i, output, options: {} }
          : i
      )
    );
  }, []);

  const processOne = useCallback(
    async (item: QueueItem) => {
      const output = item.output!;
      try {
        patch(item.id, { status: "uploading", progress: 0, error: undefined });

        const options = Object.keys(item.options).length
          ? buildOptions(await getOptionSchema(operation, item.input, output), item.options)
          : {};

        const created = await api<{ jobId: string; upload: { url: string; parameters: Record<string, string> } }>(
          "/api/freeconvert/jobs",
          { method: "POST", body: JSON.stringify({ operation, inputFormat: item.input, outputFormat: output, options }) }
        );

        await upload(created.upload, item.file, (progress) => patch(item.id, { progress }));
        patch(item.id, { status: "processing", progress: 100 });

        const started = Date.now();
        while (Date.now() - started < TIMEOUT_MS) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          const s = await api<{ status: string; url?: string; message?: string }>(`/api/freeconvert/jobs/${created.jobId}`);
          if (s.status === "done") return patch(item.id, { status: "done", url: s.url });
          if (s.status === "error") throw new Error(s.message);
        }
        throw new Error("Se agotó el tiempo de espera");
      } catch (e) {
        patch(item.id, { status: "error", error: e instanceof Error ? e.message : "Algo falló" });
      }
    },
    [operation, patch]
  );

  const start = useCallback(async () => {
    const pending = itemsRef.current.filter((i) => i.status === "ready" && i.output);
    let next = 0;
    const worker = async () => {
      while (next < pending.length) await processOne(pending[next++]);
    };
    const concurrency = Math.min(3, Math.max(1, settingsRef.current.concurrency || 1));
    await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
  }, [processOne]);

  const retry = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      if (item.targets && item.output) processOne(item);
      else {
        patch(id, { status: "loading", error: undefined });
        resolveTargets(id, item.input);
      }
    },
    [patch, processOne, resolveTargets]
  );

  return { items, addFiles, remove, clear, setOutput, setOptions, setAllOutputs, start, retry };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Error ${res.status}`);
  return body as T;
}

/** Sube el archivo directo al servidor de FreeConvert con el formulario firmado. XHR para tener progreso. */
function upload(form: { url: string; parameters: Record<string, string> }, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(form.parameters ?? {})) data.append(k, v);
    data.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", form.url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error(`La subida falló (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("La subida falló"));
    xhr.send(data);
  });
}
