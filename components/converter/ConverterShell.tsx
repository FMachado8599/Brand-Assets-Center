"use client";

import { useMemo, useRef, useState } from "react";
import { Archive, Download, FileUp, Play, Plus, RefreshCw, Settings, ShieldCheck, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BarAction, BarButton, BarDivider, BarPopover, BarSegmented, ContextBar } from "@/components/shell/ContextBar";
import { isBusy, useConverterQueue, type QueueSettings } from "@/hooks/useConverterQueue";
import { useStoredState } from "@/hooks/useStoredState";
import { outputName, type FormatTarget, type Operation, type Targets } from "@/lib/converter/catalog";
import { cn } from "@/lib/utils";
import { ConverterSettings } from "./ConverterSettings";
import { FileRow } from "./FileRow";
import { FormatPicker } from "./FormatPicker";
import { OptionsDialog } from "./OptionsDialog";

const MODES: { value: Operation; label: string; title: string; lead: string; action: string }[] = [
  {
    value: "convert",
    label: "Convertir",
    title: "Conversor de archivos",
    lead: "Imágenes, video, audio, documentos y eBooks. Elegí el formato de salida de cada archivo.",
    action: "Convertir",
  },
  {
    value: "compress",
    label: "Comprimir",
    title: "Compresor de archivos",
    lead: "Achicá imágenes, videos y PDFs manteniendo la calidad. Ajustá el nivel en las opciones avanzadas.",
    action: "Comprimir",
  },
];

const DEFAULT_SETTINGS: QueueSettings = { concurrency: 3, preferred: {} };

export function ConverterShell({ configured }: { configured: boolean }) {
  const [operation, setOperation] = useState<Operation>("convert");
  const [settings, setSettings] = useStoredState<QueueSettings>("conversor:ajustes", DEFAULT_SETTINGS);
  const queue = useConverterQueue(operation, settings);
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const mode = MODES.find((m) => m.value === operation)!;
  const { items } = queue;
  const anyBusy = items.some((i) => isBusy(i.status));
  const ready = items.filter((i) => i.status === "ready" && i.output);
  const done = items.filter((i) => i.status === "done" && i.url);
  const editing = items.find((i) => i.id === optionsFor);

  // "Todo a…" ofrece la unión de formatos posibles de los archivos pendientes.
  const sharedTargets = useMemo<Targets | null>(() => {
    const groups: Record<string, FormatTarget[]> = {};
    for (const i of items) {
      if (i.status !== "ready" || !i.targets) continue;
      for (const [g, list] of Object.entries(i.targets.groups)) {
        const acc = (groups[g] ??= []);
        for (const t of list) if (!acc.some((a) => a.slug === t.slug)) acc.push(t);
      }
    }
    return Object.keys(groups).length ? { type: "", groups } : null;
  }, [items]);

  const pick = (files: FileList | null) => {
    if (files?.length) queue.addFiles(files);
    if (inputRef.current) inputRef.current.value = "";
  };

  const downloadAll = async () => {
    // Los navegadores frenan descargas en ráfaga: se espacian un poco.
    for (const i of done) {
      const a = document.createElement("a");
      a.href = i.url!;
      a.download = outputName(i.file.name, i.output!);
      a.target = "_blank";
      a.rel = "noreferrer";
      a.click();
      await new Promise((r) => setTimeout(r, 400));
    }
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
        pick(e.dataTransfer.files);
      }}
    >
      <ContextBar>
        <BarSegmented<Operation>
          label="Operación"
          value={operation}
          onChange={setOperation}
          disabled={anyBusy}
          options={[
            { value: "convert", label: "Convertir", icon: RefreshCw },
            { value: "compress", label: "Comprimir", icon: Archive },
          ]}
        />
        <BarDivider />
        <BarButton label="Agregar archivos" icon={Plus} onClick={() => inputRef.current?.click()} />
        <BarPopover label="Configuración" icon={Settings} className="w-80">
          <ConverterSettings settings={settings} onChange={setSettings} configured={configured} />
        </BarPopover>
        {done.length > 1 && <BarButton label="Descargar todo" icon={Download} onClick={downloadAll} />}
        {ready.length > 0 && (
          <>
            <BarDivider />
            <BarAction label={mode.action} icon={Play} onClick={queue.start} disabled={!configured}>
              {mode.action}
              {ready.length > 1 && ` ${ready.length}`}
            </BarAction>
          </>
        )}
      </ContextBar>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{mode.title}</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{mode.lead}</p>
        </div>

        {!configured && (
          <div className="mb-4 rounded-2xl border border-destructive/40 bg-card p-4 text-sm">
            <Badge className="mb-2 border-destructive text-destructive">Falta configurar</Badge>
            <p className="text-muted-foreground">
              Agregá <code className="rounded bg-secondary px-1">FREECONVERT_API_KEY</code> en las variables de entorno y
              reiniciá el servidor. Podés ver los formatos, pero no convertir.
            </p>
          </div>
        )}

        <input ref={inputRef} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />

        {items.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-foreground/10 bg-card/80 px-6 py-14 text-center shadow-sm transition-colors hover:border-primary",
              dragging && "border-primary bg-primary/10"
            )}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/25">
              <FileUp className="h-6 w-6" />
            </span>
            <span className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm">
              <Plus className="h-4 w-4" /> Elegir archivos
            </span>
            <span className="text-sm text-muted-foreground">o arrastralos acá</span>
          </button>
        ) : (
          <div className={cn("overflow-hidden rounded-3xl border bg-card shadow-sm", dragging && "ring-2 ring-primary")}>
            <ul className="divide-y">
              {items.map((item) => (
                <FileRow
                  key={item.id}
                  item={item}
                  operation={operation}
                  onOutput={(slug) => queue.setOutput(item.id, slug)}
                  onOptions={() => setOptionsFor(item.id)}
                  onRemove={() => queue.remove(item.id)}
                  onRetry={() => queue.retry(item.id)}
                />
              ))}
            </ul>

            {(items.length > 1 || (ready.length > 1 && sharedTargets)) && (
              <div className="flex flex-wrap items-center gap-2 border-t bg-secondary/40 px-4 py-2.5">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {items.length} archivos{done.length > 0 && ` · ${done.length} listos`}
                </span>
                {!anyBusy && items.length > 1 && (
                  <button
                    type="button"
                    onClick={queue.clear}
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-foreground/80 hover:bg-black/5"
                  >
                    Vaciar
                  </button>
                )}
                {ready.length > 1 && sharedTargets && (
                  <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    Todo a
                    <FormatPicker targets={sharedTargets} onChange={queue.setAllOutputs} placeholder="Elegir" />
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
          {[
            { icon: Zap, title: "Rápido", text: "Hasta tres archivos a la vez. Lo ajustás en la configuración." },
            { icon: RefreshCw, title: "+500 formatos", text: "Los formatos disponibles se leen en vivo de FreeConvert." },
            { icon: ShieldCheck, title: "Directo", text: "El archivo viaja directo a FreeConvert, sin pasar por este servidor." },
          ].map((f) => (
            <li key={f.title} className="rounded-2xl border bg-card/80 p-4">
              <f.icon className="mb-2 h-4 w-4" />
              <p className="font-medium">{f.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{f.text}</p>
            </li>
          ))}
        </ul>
      </main>

      {editing && editing.output && (
        <OptionsDialog
          open
          onOpenChange={(v) => !v && setOptionsFor(null)}
          operation={operation}
          input={editing.input}
          output={editing.output}
          values={editing.options}
          sameKindCount={
            items.filter(
              (i) => i.id !== editing.id && i.status === "ready" && i.input === editing.input && i.output === editing.output
            ).length
          }
          onApply={(values, toAll) => {
            for (const i of items) {
              const same = i.status === "ready" && i.input === editing.input && i.output === editing.output;
              if (i.id === editing.id || (toAll && same)) queue.setOptions(i.id, values);
            }
            setOptionsFor(null);
          }}
        />
      )}
    </div>
  );
}
