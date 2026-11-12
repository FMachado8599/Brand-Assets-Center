"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, FileWarning, HelpCircle, ImagePlus, Loader2, Settings2, Trash2, Upload, X } from "lucide-react";
import { BarAction, BarButton, BarDivider, BarPopover, ContextBar } from "@/components/shell/ContextBar";
import { toast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm";
import { useGifProject } from "@/hooks/useGifProject";
import { useStoredState } from "@/hooks/useStoredState";
import { formatMs } from "@/lib/gif/parse";
import { DEFAULT_GIF_SETTINGS, type GifSettings } from "@/lib/gif/types";
import type { Frame } from "@/lib/gif/types";
import { cn } from "@/lib/utils";
import { isFileDrag, useFrameDrag } from "./drag";
import { GifSettingsPanel, NamingGuide } from "./GifPanels";
import { GroupCard } from "./GroupCard";
import { GroupDialog } from "./GroupDialog";
import { LooseTray } from "./LooseTray";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export function GifShell() {
  const [settings, setSettings] = useStoredState<GifSettings>("gif:ajustes", DEFAULT_GIF_SETTINGS);
  const project = useGifProject(settings);
  const { groups, loose, invalid, frames } = project;
  const [onlyWarnings, setOnlyWarnings] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  /** Hay archivos de la compu arrastrándose sobre la página. */
  const [fileOver, setFileOver] = useState(false);
  /** Las sueltas elegidas con un clic, en el orden en que van a quedar en el GIF. */
  const [selected, setSelected] = useState<string[]>([]);
  const drag = useFrameDrag();
  const inputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  const withWarnings = groups.filter((g) => g.warnings.length);
  const visible = onlyWarnings ? withWarnings : groups;
  // Se busca entre todos los grupos: si al ordenar queda uno solo, el diálogo sigue abierto para sumarle otra.
  const editingGroup = project.all.find((g) => g.key === editing) ?? null;
  const hasContent = frames.length > 0 || invalid.length > 0;
  const framesInGifs = groups.reduce((n, g) => n + g.frames.length, 0);
  const draggingLoose = !!drag.id && loose.some((f) => f.id === drag.id);

  // Si el GIF que se estaba ordenando ya no existe (se quitaron todos sus frames), se cierra del todo: si
  // no, volvería a abrirse solo al subir otra vez un archivo con ese nombre.
  useEffect(() => {
    if (editing && !editingGroup) setEditing(null);
  }, [editing, editingGroup]);

  // Si una elegida se agrupó o se quitó, deja de estar elegida.
  useEffect(() => {
    setSelected((prev) => {
      const next = prev.filter((id) => loose.some((f) => f.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [loose]);

  /** Arma un GIF con sueltas: la primera pone el grupo y las demás se suman detrás, en ese orden. */
  const combine = (target: Frame, ids: string[]) => {
    drag.end();
    project.addToGroup(ids, target.groupKey);
    setSelected([]);
    setEditing(target.groupKey);
  };

  const makeGif = () => {
    const [first, ...rest] = selected.map((id) => loose.find((f) => f.id === id)).filter(Boolean);
    if (first && rest.length) combine(first, rest.map((f) => f.id));
  };

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    await project.addFiles(files);
    if (inputRef.current) inputRef.current.value = "";
  };

  const exportAll = async () => {
    if (!groups.length) return;
    setExporting(0);
    try {
      await project.downloadZip(groups, setExporting);
      toast(`Exportados ${groups.length} GIF en un ZIP`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo exportar", "error");
    } finally {
      setExporting(null);
    }
  };

  const safely = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo generar el GIF", "error");
    }
  };

  const clearAll = async () => {
    const ok = await confirm({
      title: "¿Vaciar todo?",
      description: "Se quitan todos los frames cargados. Los archivos originales no se tocan.",
      confirmLabel: "Vaciar",
      destructive: true,
    });
    if (ok) {
      project.clear();
      setOnlyWarnings(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setFileOver(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setFileOver(false)}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setFileOver(false);
        pick(e.dataTransfer.files);
      }}
    >
      <ContextBar>
        <BarButton label="Subir frames" icon={Upload} onClick={() => inputRef.current?.click()} />
        <BarDivider />
        <BarPopover label="Ajustes del GIF" icon={Settings2} className="w-80">
          <GifSettingsPanel settings={settings} onChange={setSettings} />
        </BarPopover>
        <BarButton
          label={onlyWarnings ? "Ver todos" : "Solo con avisos"}
          icon={AlertTriangle}
          pressed={onlyWarnings}
          badge={withWarnings.length || undefined}
          disabled={!withWarnings.length && !onlyWarnings}
          onClick={() => setOnlyWarnings((v) => !v)}
        />
        <BarPopover label="Cómo se arman los GIF" icon={HelpCircle} className="w-80">
          <NamingGuide />
        </BarPopover>
        {hasContent && <BarButton label="Vaciar" icon={Trash2} onClick={clearAll} />}
        {groups.length > 0 && (
          <>
            <BarDivider />
            <BarAction
              label="Exportar ZIP"
              icon={exporting !== null ? Loader2 : Download}
              onClick={exportAll}
              disabled={exporting !== null}
              className={exporting !== null ? "[&_svg]:animate-spin" : undefined}
            >
              {exporting !== null ? `${exporting}/${groups.length}` : `Exportar ${groups.length} GIF`}
            </BarAction>
          </>
        )}
      </ContextBar>

      <input ref={inputRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => pick(e.target.files)} />

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-[5.5rem] sm:px-6">
        <h1 className="sr-only">GIF</h1>

        {!hasContent ? (
          <div className="mx-auto max-w-2xl pt-6">
            <div className="mb-6 text-center">
              <h2 className="font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">GIFs desde frames</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                Soltá todas las imágenes de una vez: las que se llaman igual y terminan en número (banner_1, banner_2…) forman
                un GIF. Las demás quedan sueltas y se agrupan arrastrando una sobre otra.
              </p>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex w-full flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-foreground/10 bg-card/80 px-6 py-14 text-center shadow-sm transition-colors hover:border-primary",
                fileOver && "border-primary bg-primary/10"
              )}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/25">
                <ImagePlus className="h-6 w-6" />
              </span>
              <span className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm">
                <Upload className="h-4 w-4" /> Elegir frames
              </span>
              <span className="text-sm text-muted-foreground">o arrastralos acá · JPG, PNG, WebP</span>
              <span className="mt-1 flex flex-wrap justify-center gap-1.5">
                {["banner_1.jpg", "banner_2.jpg", "300x250_2-1.5s.jpg"].map((n) => (
                  <code key={n} className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-[11px] text-foreground/80">
                    {n}
                  </code>
                ))}
              </span>
            </button>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Todo se procesa en tu navegador: las imágenes no se suben a ningún lado.
            </p>
          </div>
        ) : (
          <div className={cn("flex flex-col gap-6", fileOver && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Stat>{framesInGifs} frames</Stat>
              <Stat>{groups.length} GIF</Stat>
              {loose.length > 0 && <Stat>{loose.length} sueltas</Stat>}
              {withWarnings.length > 0 && <Stat tone="warn">{withWarnings.length} con avisos</Stat>}
              {invalid.length > 0 && <Stat tone="error">{invalid.length} sin leer</Stat>}
              <Stat>
                {formatMs(settings.unit === "ms" ? settings.defaultDuration : settings.defaultDuration * 1000)} por defecto
              </Stat>
              {onlyWarnings && (
                <button
                  type="button"
                  onClick={() => setOnlyWarnings(false)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-foreground/80 hover:bg-black/5"
                >
                  <X className="h-3 w-3" /> Ver todos
                </button>
              )}
            </div>

            {loose.length > 0 && (
              <LooseTray
                frames={loose}
                drag={drag}
                selected={selected}
                onToggle={(id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
                onClearSelection={() => setSelected([])}
                onCombine={(target, id) => combine(target, [id])}
                onMakeGif={makeGif}
                onRemove={project.removeFrame}
              />
            )}

            {visible.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((group) => (
                  <GroupCard
                    key={group.key}
                    group={group}
                    settings={settings}
                    rendered={project.renderOf(group)}
                    rendering={project.rendering.has(group.key)}
                    onEdit={() => setEditing(group.key)}
                    onDownload={() => safely(() => project.downloadGroup(group))}
                    onMeasure={() => safely(() => project.render(group))}
                    canDrop={draggingLoose}
                    onDropFrame={() => {
                      if (!drag.id) return;
                      drag.end();
                      project.addToGroup([drag.id], group.key);
                      setEditing(group.key);
                    }}
                  />
                ))}
              </div>
            )}

            {invalid.length > 0 && (
              <section className="rounded-3xl border bg-card p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <FileWarning className="h-4 w-4 text-destructive" /> Archivos que no se pudieron usar
                </h2>
                <ul className="divide-y">
                  {invalid.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 py-2">
                      {f.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.url} alt="" className="h-9 w-12 shrink-0 rounded bg-secondary object-contain" />
                      ) : (
                        <span className="h-9 w-12 shrink-0 rounded bg-secondary" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs">{f.filename}</p>
                        <p className="text-xs text-muted-foreground">{f.reason}</p>
                      </div>
                      <button
                        type="button"
                        aria-label="Quitar"
                        onClick={() => project.removeInvalid(f.id)}
                        className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Se aceptan JPG, PNG, WebP y GIF. Si los arreglás y los volvés a subir con el mismo nombre, se reemplazan solos.
                </p>
              </section>
            )}
          </div>
        )}
      </main>

      <GroupDialog
        group={editingGroup}
        loose={editingGroup ? loose.filter((f) => f.groupKey !== editingGroup.key) : []}
        settings={settings}
        drag={drag}
        onClose={() => setEditing(null)}
        onDuration={project.setDuration}
        onMove={project.moveFrame}
        onAdd={(id, at) => editingGroup && project.addToGroup([id], editingGroup.key, at)}
        onUngroup={project.ungroup}
        onRemove={project.removeFrame}
        onRename={(name) => editingGroup && project.rename(editingGroup.key, name)}
      />
    </div>
  );
}

function Stat({ children, tone }: { children: React.ReactNode; tone?: "warn" | "error" }) {
  return (
    <span
      className={cn(
        "rounded-full border bg-card px-2.5 py-0.5 font-medium tabular-nums shadow-sm",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "error" && "border-destructive/30 bg-destructive/5 text-destructive"
      )}
    >
      {children}
    </span>
  );
}
