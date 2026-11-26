"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/components/shell/AccountProvider";
import { supabase } from "@/lib/supabase";
import { prepareImage } from "@/lib/retoque/prepare.client";
import { inputPath, RETOQUE_BUCKET, storageMessage } from "@/lib/retoque/storage";

export type RetoqueStatus = "queued" | "preparing" | "uploading" | "processing" | "downloading" | "done" | "error";

export type RetoqueItem = {
  id: string;
  file: File;
  /** La imagen original, para verla y compararla (object URL). */
  originalUrl: string;
  width?: number;
  height?: number;
  status: RetoqueStatus;
  error?: string;
  /** Si hubo que adaptarla antes de mandarla (pasarla a JPG, achicarla). */
  note?: string;
  /** El PNG sin fondo y su object URL. */
  result?: Blob;
  resultUrl?: string;
};

/** Cuántas a la vez: Magnific limita los pedidos simultáneos por cuenta. */
const CONCURRENCY = 2;

export const isBusy = (s: RetoqueStatus) => s === "preparing" || s === "uploading" || s === "processing" || s === "downloading";

/**
 * La cola de Retoque: cada imagen que entra se procesa sola, de a dos. Por imagen:
 * preparar (lib/retoque/prepare.client.ts) → subir a Storage → /api/retoque/fondo → bajar el PNG.
 */
export function useRetoqueQueue() {
  const account = useAccount();
  const userRef = useRef(account?.user ?? null);
  userRef.current = account?.user ?? null;

  const [items, setItems] = useState<RetoqueItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const waiting = useRef<string[]>([]);
  const running = useRef(0);

  const patch = useCallback((id: string, p: Partial<RetoqueItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }, []);

  const processOne = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      try {
        const user = userRef.current;
        if (!user) throw new Error("Iniciá sesión con tu cuenta del estudio");

        patch(id, { status: "preparing", error: undefined });
        const prepared = await prepareImage(item.file);
        patch(id, { status: "uploading", width: prepared.width, height: prepared.height, note: prepared.note });

        const path = inputPath(user.id, prepared.ext);
        const { error: uploadError } = await supabase.storage
          .from(RETOQUE_BUCKET)
          .upload(path, prepared.blob, { contentType: prepared.type, upsert: false });
        if (uploadError) throw new Error(storageMessage(uploadError));

        patch(id, { status: "processing" });
        const res = await fetch("/api/retoque/fondo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || typeof body?.file !== "string") throw new Error(body?.error ?? `Error ${res.status}`);

        patch(id, { status: "downloading" });
        const file = await fetch(body.file);
        if (!file.ok) throw new Error(file.status === 410 ? "El resultado venció antes de bajarlo: reintentá" : "No se pudo bajar el resultado");
        const result = await file.blob();

        // Si mientras tanto la sacaron de la lista, no se guarda nada.
        if (!itemsRef.current.some((i) => i.id === id)) return;
        patch(id, { status: "done", result, resultUrl: URL.createObjectURL(result) });
      } catch (e) {
        patch(id, { status: "error", error: e instanceof Error ? e.message : "Algo falló" });
      }
    },
    [patch]
  );

  const pump = useCallback(() => {
    while (running.current < CONCURRENCY && waiting.current.length) {
      const id = waiting.current.shift()!;
      running.current++;
      processOne(id).finally(() => {
        running.current--;
        pump();
      });
    }
  }, [processOne]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
      const added = images.map<RetoqueItem>((file) => ({
        id: crypto.randomUUID(),
        file,
        originalUrl: URL.createObjectURL(file),
        status: "queued",
      }));
      if (!added.length) return 0;
      // El estado tiene que estar antes de arrancar: processOne lo lee de itemsRef.
      itemsRef.current = [...itemsRef.current, ...added];
      setItems((prev) => [...prev, ...added]);
      waiting.current.push(...added.map((i) => i.id));
      pump();
      return added.length;
    },
    [pump]
  );

  const retry = useCallback(
    (id: string) => {
      patch(id, { status: "queued", error: undefined });
      waiting.current.push(id);
      pump();
    },
    [patch, pump]
  );

  const release = (i: RetoqueItem) => {
    URL.revokeObjectURL(i.originalUrl);
    if (i.resultUrl) URL.revokeObjectURL(i.resultUrl);
  };

  const remove = useCallback((id: string) => {
    waiting.current = waiting.current.filter((w) => w !== id);
    setItems((prev) => {
      const gone = prev.find((i) => i.id === id);
      if (gone) release(gone);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  /** Vacía la lista, menos las que se están procesando. */
  const clear = useCallback(() => {
    waiting.current = [];
    setItems((prev) => {
      prev.filter((i) => !isBusy(i.status)).forEach(release);
      return prev.filter((i) => isBusy(i.status));
    });
  }, []);

  // Al salir de la página se liberan las imágenes de la memoria.
  useEffect(() => () => itemsRef.current.forEach(release), []);

  return { items, addFiles, retry, remove, clear };
}
