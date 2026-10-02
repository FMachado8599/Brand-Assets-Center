"use client";

import { AlertCircle, CheckCircle2, Download, File, FileArchive, FileAudio, FileImage, FileText, FileVideo, Loader2, RotateCcw, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, outputName, type Operation } from "@/lib/converter/catalog";
import { isBusy, type QueueItem } from "@/hooks/useConverterQueue";
import { FormatPicker } from "./FormatPicker";

const ICONS: Record<string, typeof File> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  document: FileText,
  ebook: FileText,
  archive: FileArchive,
};

export function FileRow({
  item,
  operation,
  onOutput,
  onOptions,
  onRemove,
  onRetry,
}: {
  item: QueueItem;
  operation: Operation;
  onOutput: (slug: string) => void;
  onOptions: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const Icon = ICONS[item.targets?.type ?? ""] ?? File;
  const busy = isBusy(item.status);
  const editable = item.status === "ready";
  const hasOptions = Object.keys(item.options).length > 0;

  return (
    <li className="relative flex flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden px-4 py-3 sm:flex-nowrap">
      {busy && (
        <span
          className="absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-[width] duration-300"
          style={{ width: item.status === "processing" ? "100%" : `${item.progress}%` }}
        />
      )}

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={item.file.name}>
            {item.status === "done" && item.output ? outputName(item.file.name, item.output) : item.file.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(item.file.size)}
            {item.input && <span className="font-mono uppercase"> · {item.input}</span>}
          </p>
        </div>
      </div>

      <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
        <Status item={item} />

        {(editable || item.status === "loading") && (
          <>
            <span className="text-xs text-muted-foreground">{operation === "compress" ? "como" : "a"}</span>
            <FormatPicker targets={item.targets} value={item.output} onChange={onOutput} disabled={!editable} />
            <Button
              variant={hasOptions ? "secondary" : "ghost"}
              size="iconSm"
              onClick={onOptions}
              disabled={!editable || !item.output}
              aria-label="Opciones avanzadas"
              title="Opciones avanzadas"
              className="relative"
            >
              <Settings2 />
              {hasOptions && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />}
            </Button>
          </>
        )}

        {item.status === "done" && item.url && (
          <Button size="sm" asChild>
            <a href={item.url} download={outputName(item.file.name, item.output!)} target="_blank" rel="noreferrer">
              <Download /> Descargar
            </a>
          </Button>
        )}

        {item.status === "error" && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw /> Reintentar
          </Button>
        )}

        {!busy && (
          <Button variant="ghost" size="iconSm" onClick={onRemove} aria-label="Quitar">
            <X />
          </Button>
        )}
      </div>
    </li>
  );
}

function Status({ item }: { item: QueueItem }) {
  switch (item.status) {
    case "uploading":
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo {item.progress}%
        </span>
      );
    case "processing":
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procesando…
        </span>
      );
    case "done":
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Listo
        </span>
      );
    case "error":
    case "unsupported":
      return (
        <span className="flex max-w-[16rem] items-center gap-1.5 text-xs text-destructive" title={item.error}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{item.error}</span>
        </span>
      );
    default:
      return null;
  }
}
