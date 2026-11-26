"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Layers, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { BarAction, BarButton, BarDivider, BarNote, ContextBar } from "@/components/shell/ContextBar";
import { isBusy, useRetoqueQueue, type RetoqueItem } from "@/hooks/useRetoqueQueue";
import { useStoredState } from "@/hooks/useStoredState";
import { outputName } from "@/lib/retoque/prepare.client";
import { cn } from "@/lib/utils";
import { BACKDROPS, type Backdrop } from "./backdrops";
import { ImageCard } from "./ImageCard";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // El navegador ya tomó el archivo: se libera un rato después (si se libera enseguida, Safari lo pierde).
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Nombres sin repetir dentro del ZIP: "foto (sin fondo).png", "foto (sin fondo) (2).png"… */
function uniqueNames(items: RetoqueItem[]) {
  const seen = new Map<string, number>();
  return items.map((i) => {
    const name = outputName(i.file.name);
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : name.replace(/\.png$/, ` (${n}).png`);
  });
}

/**
 * Retoque: por ahora, quitar el fondo con Magnific. Las imágenes se procesan solas apenas entran
 * (hooks/useRetoqueQueue.ts); la página las muestra, deja compararlas con la original y bajarlas.
 */
export function RetoqueShell({ configured }: { configured: boolean }) {
  const queue = useRetoqueQueue();
  const [backdrop, setBackdrop] = useStoredState<Backdrop>("retoque:fondo", "checker");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { items } = queue;
  const done = items.filter((i) => i.status === "done" && i.result);
  const pending = items.filter((i) => i.status === "queued" || isBusy(i.status)).length;
  const clearable = items.some((i) => !isBusy(i.status));

  const add = useCallback(
    (files: FileList | File[] | null) => {
      if (!files || !files.length) return;
      if (!configured) return toast("Retoque todavía no está configurado: falta MAGNIFIC_API_KEY", "error");
      const added = queue.addFiles(files);
      if (!added) toast("Solo se pueden agregar imágenes", "error");
    },
    [configured, queue.addFiles]
  );

  const pick = (files: FileList | null) => {
    add(files);
    if (inputRef.current) inputRef.current.value = "";
  };

  // Ctrl+V con una imagen copiada (de la web, de Figma, una captura) la suma, desde cualquier parte de la página.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      add(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  const downloadOne = (item: RetoqueItem) => item.result && saveBlob(item.result, outputName(item.file.name));

  const downloadAll = async () => {
    if (done.length === 1) return downloadOne(done[0]);
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const names = uniqueNames(done);
    done.forEach((item, n) => zip.file(names[n], item.result!));
    saveBlob(await zip.generateAsync({ type: "blob" }), "Sin fondo.zip");
  };

  return (
    <div
      className="min-h-screen"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        add(e.dataTransfer.files);
      }}
    >
      <ContextBar>
        <BarButton label="Agregar imágenes" icon={Plus} onClick={() => inputRef.current?.click()} disabled={!configured} />
        <BarDivider />
        {BACKDROPS.map((b) => (
          <BarButton
            key={b.value}
            label={`Ver sobre ${b.label}`}
            pressed={backdrop === b.value}
            onClick={() => setBackdrop(b.value)}
            glyph={<span aria-hidden className="h-4 w-4 rounded-full ring-1 ring-cream/40" style={{ ...b.style, backgroundSize: "8px 8px" }} />}
          />
        ))}
        {clearable && (
          <>
            <BarDivider />
            <BarButton label="Vaciar la lista" icon={Trash2} onClick={queue.clear} />
          </>
        )}
        {pending > 0 && <BarNote>{pending === 1 ? "Falta 1" : `Faltan ${pending}`}</BarNote>}
        {done.length > 0 && (
          <>
            <BarDivider />
            <BarAction label={done.length > 1 ? "Descargar todas en un ZIP" : "Descargar"} icon={Download} onClick={downloadAll}>
              {done.length > 1 ? `Descargar ${done.length}` : "Descargar"}
            </BarAction>
          </>
        )}
      </ContextBar>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-6 text-center">
          <p className="eyebrow">Retoque</p>
          <h1 className="mt-1 font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">Quitar fondo</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Soltá una o varias imágenes: salen en PNG con el fondo transparente, del mismo tamaño. Lo hace Magnific.
          </p>
        </div>

        {!configured && (
          <div className="mx-auto mb-4 max-w-3xl rounded-2xl border border-destructive/40 bg-card p-4 text-sm">
            <Badge className="mb-2 border-destructive text-destructive">Falta configurar</Badge>
            <p className="text-muted-foreground">
              Agregá <code className="rounded bg-secondary px-1">MAGNIFIC_API_KEY</code> en las variables de entorno y
              reiniciá el servidor (ver README, Retoque).
            </p>
          </div>
        )}

        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.target.files)} />

        {items.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!configured}
            className={cn(
              "mx-auto flex w-full max-w-3xl flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-foreground/10 bg-card/80 px-6 py-14 text-center shadow-sm transition-colors hover:border-primary disabled:pointer-events-none disabled:opacity-60",
              dragging && "border-primary bg-primary/10"
            )}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/25">
              <ImagePlus className="h-6 w-6" />
            </span>
            <span className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm">
              <Plus className="h-4 w-4" /> Elegir imágenes
            </span>
            <span className="text-sm text-muted-foreground">
              o arrastralas acá, o pegalas con <kbd className="rounded border bg-secondary px-1 font-ui text-[11px]">Ctrl</kbd>
              +<kbd className="rounded border bg-secondary px-1 font-ui text-[11px]">V</kbd>
            </span>
          </button>
        ) : (
          <>
            <ul className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", dragging && "rounded-3xl ring-2 ring-primary ring-offset-4 ring-offset-background")}>
              {items.map((item) => (
                <ImageCard
                  key={item.id}
                  item={item}
                  backdrop={backdrop}
                  onRetry={() => queue.retry(item.id)}
                  onRemove={() => queue.remove(item.id)}
                  onDownload={() => downloadOne(item)}
                />
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-foreground/10 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  <Plus className="h-5 w-5" /> Sumar imágenes
                </button>
              </li>
            </ul>
            {done.length > 0 && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Pasá el mouse (o el dedo) por una imagen para compararla con la original.
              </p>
            )}
          </>
        )}

        <ul className="mx-auto mt-8 grid max-w-3xl gap-3 text-sm sm:grid-cols-3">
          {[
            { icon: Layers, title: "PNG transparente", text: "Del tamaño de la original, hasta 25 MP. Las más grandes se achican antes." },
            { icon: ImagePlus, title: "De a varias", text: "Elegí, arrastrá o pegá todas juntas: se procesan solas, de a dos." },
            { icon: ShieldCheck, title: "No queda guardada", text: "La imagen espera en Supabase mientras Magnific la procesa y se borra al terminar." },
          ].map((f) => (
            <li key={f.title} className="rounded-2xl border bg-card/80 p-4">
              <f.icon className="mb-2 h-4 w-4" />
              <p className="font-medium">{f.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{f.text}</p>
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-3 max-w-3xl text-center text-xs text-muted-foreground">Cada imagen gasta créditos de Magnific.</p>
      </main>
    </div>
  );
}
