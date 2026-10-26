"use client";

import { AlertCircle, CheckCircle2, ChevronDown, CloudUpload, Copy, Download, ExternalLink, Film, ImageIcon, Layers, Loader2, Play, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { Hint } from "@/components/ui/tooltip";
import { formatBytes } from "@/lib/converter/catalog";
import type { Link } from "@/lib/downloads/links";
import { coverChoice, planTargets, saveHint } from "@/lib/downloads/targets";
import type { CoverMode, MediaFile, MediaInfo, SaveSettings, YoutubeQuality } from "@/lib/downloads/types";
import { cn } from "@/lib/utils";
import { COVER_OPTIONS, ModeIcons, optionOf } from "./modes";
import { PLATFORM_NAMES, PlatformIcon } from "./PlatformIcon";

/** Lo que está pasando con lo que se pidió guardar de esta fila. */
export type Transfer = {
  state: "working" | "done" | "error";
  label: string;
  percent?: number;
  /** El archivo (o la carpeta, si fueron varios) en Drive. */
  driveUrl?: string;
};

export type DownloadItem = {
  link: Link;
  status: "loading" | "ready" | "error";
  info?: MediaInfo;
  error?: string;
  /** Solo los errores pasajeros (red, la plataforma caída) tienen sentido de reintentar. */
  retryable?: boolean;
  /** YouTube: la calidad elegida (el `q` de YoutubeQuality). */
  quality?: number;
  /** Qué bajar de los videos de esta fila, si se eligió acá; si no, vale lo de "Cómo se guarda". */
  portada?: CoverMode;
  transfer?: Transfer;
};

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

/** El peso de lo que va a salir de YouTube con la calidad y el sonido elegidos. */
function youtubeSize(info: MediaInfo, quality: YoutubeQuality | undefined, audio: SaveSettings["audio"]) {
  const size = audio === "solo" ? info.youtube?.audio : audio === "sin" ? quality?.mute : quality?.video;
  return size ? `~${formatBytes(size)}` : null;
}

/** Lo que hace el click en un archivo del carrusel, para su descripción. */
function fileAction(file: MediaFile, i: number, settings: SaveSettings, mode: CoverMode) {
  const verb = settings.destino === "drive" ? "Guardar en Drive" : "Descargar";
  if (file.kind !== "video") return `${verb} la foto ${i + 1}`;
  if (mode === "portada" && file.cover) return `${verb} la portada del video ${i + 1}`;
  if (mode === "ambos" && file.cover) return `${verb} el video ${i + 1} y su portada`;
  return `${verb} el video ${i + 1}`;
}

export function DownloadRow({
  item,
  settings,
  mode,
  onSave,
  onCover,
  onQuality,
  onRetry,
  onRemove,
}: {
  item: DownloadItem;
  settings: SaveSettings;
  /** Qué bajar de los videos de esta fila: lo suyo o, si no eligió, lo de todos. */
  mode: CoverMode;
  /** Sin archivo: todo lo de la fila (el video de YouTube, o todos los del carrusel). */
  onSave: (file?: MediaFile) => void;
  onCover: (mode: CoverMode) => void;
  onQuality: (q: number) => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const { info, transfer } = item;
  const files = info?.files ?? [];
  const yt = info?.youtube;
  const quality = yt?.qualities.find((q) => q.q === item.quality) ?? yt?.qualities[0];
  const single = files.length === 1 ? files[0] : undefined;
  const busy = transfer?.state === "working";
  const targets = info ? planTargets(info, mode, { quality: item.quality }) : [];
  const choice = info ? coverChoice(info) : { hasVideo: false, hasCover: false };
  // Bajando solo portadas, el peso de los videos no dice nada.
  const onlyCovers = targets.length > 0 && targets.every((t) => t.cover);
  const totalSize = !onlyCovers && files.length && files.every((f) => f.size) ? files.reduce((n, f) => n + f.size!, 0) : undefined;
  const meta = [
    info?.platform !== "pinterest" && info?.author,
    files.length > 1 && countLabel(files),
    info?.duration && clock(info.duration),
    single?.width && single.height && `${single.width}×${single.height}`,
    totalSize && formatBytes(totalSize),
    info && yt && !onlyCovers && youtubeSize(info, quality, settings.audio),
  ].filter(Boolean);
  const canSave = targets.length > 0;
  const ActionIcon = settings.destino === "compu" ? Download : CloudUpload;
  const hint = canSave ? saveHint(settings.destino, settings.audio, targets) : "No tiene portada: elegí bajar el video";

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(info!.caption!);
      toast("Texto copiado");
    } catch {
      toast("El navegador no dejó copiar el texto.", "error");
    }
  };

  return (
    <li className="relative overflow-hidden px-4 py-3">
      {busy && (
        <span
          className="absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-[width] duration-300"
          style={{ width: transfer.percent === undefined ? "100%" : `${transfer.percent}%`, opacity: transfer.percent === undefined ? 0.4 : 1 }}
        />
      )}

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
              (single?.kind === "video" || yt) && (
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
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Hint label={PLATFORM_NAMES[item.link.platform]}>
                <span className="inline-flex shrink-0">
                  <PlatformIcon platform={item.link.platform} className="h-3.5 w-3.5" />
                  <span className="sr-only">{PLATFORM_NAMES[item.link.platform]}</span>
                </span>
              </Hint>
              {meta.length > 0 && <span className="truncate">{meta.join(" · ")}</span>}
            </p>
          </div>
        </div>

        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          {item.status === "loading" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {item.link.platform === "youtube" ? "Leyendo el video…" : "Buscando…"}
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

          {transfer && <TransferStatus transfer={transfer} onRetry={() => onSave()} />}

          {info?.caption && (
            <Hint label="Copiar el texto del posteo">
              <Button variant="ghost" size="iconSm" onClick={copyCaption} aria-label="Copiar el texto del posteo">
                <Copy />
              </Button>
            </Hint>
          )}

          {yt && settings.audio !== "solo" && !onlyCovers && yt.qualities.length > 1 && (
            <Select value={String(quality?.q)} onValueChange={(v) => onQuality(Number(v))} disabled={busy}>
              <SelectTrigger className="h-8 w-[5.5rem] rounded-md text-xs" aria-label="Calidad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yt.qualities.map((q) => (
                  <SelectItem key={q.q} value={String(q.q)} className="text-xs">
                    {q.res}p
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {info && !canSave && <span className="text-xs text-muted-foreground">Sin portada</span>}

          {info && (canSave || choice.hasVideo) && !busy && transfer?.state !== "error" && (
            <div className="flex">
              <Hint label={hint}>
                {/* Apagado no recibe el mouse: el tooltip va en un span alrededor. */}
                <span className="inline-flex">
                  <Button
                    size="sm"
                    onClick={() => onSave()}
                    disabled={!canSave}
                    aria-label={canSave ? hint : "Descargar"}
                    className={cn(choice.hasVideo && "rounded-r-none")}
                  >
                    <ActionIcon /> Descargar
                  </Button>
                </span>
              </Hint>
              {choice.hasVideo && (
                // Sin portada, "video y portada" baja solo el video: el botón muestra lo que de verdad sale.
                <CoverMenu value={!choice.hasCover && mode === "ambos" ? "video" : mode} hasCover={choice.hasCover} onChange={onCover} />
              )}
            </div>
          )}

          {item.status !== "loading" && !busy && (
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
              <button
                type="button"
                onClick={() => onSave(file)}
                disabled={busy || planTargets(info, mode, { file }).length === 0}
                title={fileAction(file, i, settings, mode)}
                aria-label={fileAction(file, i, settings, mode)}
                className="group relative grid h-16 w-16 place-items-center overflow-hidden rounded-lg bg-secondary text-muted-foreground outline-none ring-ring focus-visible:ring-2 disabled:cursor-wait"
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
                  <ActionIcon className="h-4 w-4" />
                </span>
                <span className="absolute bottom-1 right-1 rounded bg-ink/75 px-1 text-[10px] font-semibold tabular-nums leading-4 text-cream group-hover:opacity-0">
                  {i + 1}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** El botón pegado a Descargar: qué bajar de los videos de esta fila (el video, con su portada o solo la portada). */
function CoverMenu({ value, hasCover, onChange }: { value: CoverMode; hasCover: boolean; onChange: (mode: CoverMode) => void }) {
  const current = optionOf(COVER_OPTIONS, value);
  return (
    <DropdownMenu>
      <Hint label={`Qué bajar: ${current.label}`}>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            aria-label={`Qué bajar de este link: ${current.label}`}
            className="gap-1 rounded-l-none border-l border-primary-foreground/25 px-2"
          >
            <ModeIcons icons={current.icons} />
            <ChevronDown className="!size-3 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="min-w-[13rem]">
        <DropdownMenuLabel>Qué bajar de este link</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => v !== value && onChange(v as CoverMode)}>
          {COVER_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} disabled={o.value !== "video" && !hasCover}>
              <ModeIcons icons={o.icons} className="h-4 w-4" />
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {!hasCover && <p className="px-2 pb-1.5 pt-0.5 text-[11px] text-muted-foreground">Este link no trae portada.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TransferStatus({ transfer, onRetry }: { transfer: Transfer; onRetry: () => void }) {
  if (transfer.state === "working") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="tabular-nums">
          {transfer.label}
          {transfer.percent !== undefined && ` ${transfer.percent}%`}
        </span>
      </span>
    );
  }
  if (transfer.state === "error") {
    return (
      <>
        <span className="flex max-w-[18rem] items-center gap-1.5 text-xs text-destructive" title={transfer.label}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2">{transfer.label}</span>
        </span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw /> Reintentar
        </Button>
      </>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      {transfer.driveUrl ? (
        <a href={transfer.driveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
          {transfer.label} <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        transfer.label
      )}
    </span>
  );
}
