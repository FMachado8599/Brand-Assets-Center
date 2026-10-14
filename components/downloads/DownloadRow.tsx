"use client";

import { AlertCircle, Copy, Download, Film, ImageIcon, Layers, Loader2, Play, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { Hint } from "@/components/ui/tooltip";
import { formatBytes } from "@/lib/converter/catalog";
import { downloadName, type Link } from "@/lib/downloads/links";
import type { MediaFile, MediaInfo, Platform } from "@/lib/downloads/types";

export type DownloadItem = {
  link: Link;
  status: "loading" | "ready" | "error";
  info?: MediaInfo;
  error?: string;
  /** Solo los errores pasajeros (red, la plataforma caída) tienen sentido de reintentar. */
  retryable?: boolean;
};

const PLATFORMS: Record<Platform, string> = { instagram: "Instagram", pinterest: "Pinterest", youtube: "YouTube" };

export function fileHref(info: MediaInfo, file: MediaFile) {
  const qs = new URLSearchParams({ src: file.url, name: downloadName(info, file) });
  return `/api/descargas/file?${qs}`;
}

/** Baja varios archivos seguidos: los navegadores frenan las descargas en ráfaga, así que se espacian un poco. */
export async function saveAll(pairs: { info: MediaInfo; file: MediaFile }[]) {
  for (const [i, { info, file }] of pairs.entries()) {
    if (i) await new Promise((r) => setTimeout(r, 400));
    const a = document.createElement("a");
    a.href = fileHref(info, file);
    a.download = downloadName(info, file);
    a.click();
  }
}

function clock(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** "3 fotos y 2 videos", "1 video". */
function countLabel(files: MediaFile[]) {
  const videos = files.filter((f) => f.kind === "video").length;
  const images = files.length - videos;
  return [images && `${images} ${images === 1 ? "foto" : "fotos"}`, videos && `${videos} ${videos === 1 ? "video" : "videos"}`]
    .filter(Boolean)
    .join(" y ");
}

export function DownloadRow({
  item,
  onRetry,
  onRemove,
}: {
  item: DownloadItem;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const { info } = item;
  const files = info?.files ?? [];
  const single = files.length === 1 ? files[0] : undefined;
  const totalSize = files.length && files.every((f) => f.size) ? files.reduce((n, f) => n + f.size!, 0) : undefined;
  const meta = [
    PLATFORMS[item.link.platform],
    info?.platform === "instagram" && info.author,
    files.length > 1 && countLabel(files),
    info?.duration && clock(info.duration),
    single?.width && single.height && `${single.width}×${single.height}`,
    totalSize && formatBytes(totalSize),
  ].filter(Boolean);

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(info!.caption!);
      toast("Texto copiado");
    } catch {
      toast("El navegador no dejó copiar el texto.", "error");
    }
  };

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary text-muted-foreground">
            {info?.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={info.thumbnail} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : item.status === "loading" ? (
              <span className="skeleton absolute inset-0" />
            ) : (
              <Film className="h-5 w-5" />
            )}
            {files.length > 1 ? (
              <span className="absolute right-1 top-1 flex items-center gap-0.5 rounded-full bg-ink/75 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-cream">
                <Layers className="h-2.5 w-2.5" />
                {files.length}
              </span>
            ) : (
              single?.kind === "video" && (
                <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-ink/75 text-cream">
                  <Play className="h-2 w-2 fill-current" />
                </span>
              )
            )}
          </span>
          <div className="min-w-0">
            {info ? (
              <a
                href={info.pageUrl}
                target="_blank"
                rel="noreferrer"
                title={info.title}
                className="block truncate text-sm font-medium hover:underline"
              >
                {info.title}
              </a>
            ) : (
              <p className="truncate text-sm font-medium text-muted-foreground" title={item.link.url}>
                {item.link.url}
              </p>
            )}
            <p className="truncate text-xs text-muted-foreground">{meta.join(" · ")}</p>
          </div>
        </div>

        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          {item.status === "loading" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
            </span>
          )}

          {item.status === "error" && (
            <>
              <span className="flex max-w-[18rem] items-center gap-1.5 text-xs text-destructive" title={item.error}>
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="line-clamp-2">{item.error}</span>
              </span>
              {item.retryable && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  <RotateCcw /> Reintentar
                </Button>
              )}
            </>
          )}

          {info?.caption && (
            <Hint label="Copiar el texto del posteo">
              <Button variant="ghost" size="iconSm" onClick={copyCaption} aria-label="Copiar el texto del posteo">
                <Copy />
              </Button>
            </Hint>
          )}

          {single && info && (
            <Button size="sm" asChild>
              <a href={fileHref(info, single)} download={downloadName(info, single)}>
                <Download /> Descargar
              </a>
            </Button>
          )}
          {files.length > 1 && (
            <Button size="sm" onClick={() => saveAll(files.map((file) => ({ info: info!, file })))}>
              <Download /> Descargar {files.length}
            </Button>
          )}

          {item.status !== "loading" && (
            <Button variant="ghost" size="iconSm" onClick={onRemove} aria-label="Quitar">
              <X />
            </Button>
          )}
        </div>
      </div>

      {info && files.length > 1 && (
        <ul className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:ml-[4.25rem] sm:mr-0 sm:pl-0">
          {files.map((file, i) => (
            <li key={file.url} className="shrink-0">
              <a
                href={fileHref(info, file)}
                download={downloadName(info, file)}
                title={`Descargar ${file.kind === "video" ? "el video" : "la foto"} ${i + 1}`}
                className="group relative grid h-16 w-16 place-items-center overflow-hidden rounded-lg bg-secondary text-muted-foreground outline-none ring-ring focus-visible:ring-2"
              >
                {file.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.thumbnail} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
                ) : file.kind === "video" ? (
                  <Film className="h-4 w-4" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
                {file.kind === "video" && (
                  <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-ink/75 text-cream">
                    <Play className="h-2 w-2 fill-current" />
                  </span>
                )}
                <span className="absolute inset-0 grid place-items-center bg-ink/55 text-cream opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Download className="h-4 w-4" />
                </span>
                <span className="absolute bottom-1 right-1 rounded bg-ink/75 px-1 text-[10px] font-semibold tabular-nums leading-4 text-cream group-hover:opacity-0">
                  {i + 1}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
