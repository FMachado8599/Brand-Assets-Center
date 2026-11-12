"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, DatabaseZap, Download, FolderPlus, ImagePlus, Loader2, MoreHorizontal, Plus, Trash2, UploadCloud } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toaster";
import { Hint } from "@/components/ui/tooltip";
import { getClient } from "@/hooks/useClients";
import { inspectLogoImage } from "@/lib/clients/logo";
import {
  addGroup,
  applyUploads,
  downloadLogoFile,
  downloadNameOf,
  faceAsLogo,
  formatCounts,
  GROUP_SUGGESTIONS,
  LOGO_FILES_ACCEPT,
  LOGO_FORMATS,
  logoFileProblem,
  logosIn,
  mergeLogos,
  moveLogo,
  orphanedPaths,
  planUpload,
  previewOf,
  safeFileName,
  saveBlob,
  shiftGroup,
  uploadSummary,
  zipLogoFiles,
  type Uploaded,
} from "@/lib/clients/logos";
import { brandsRepo, clientErrorMessage, type BrandPatch } from "@/lib/repos/brands";
import type { Brand, BrandLogo, LogoFormat, LogoGroup } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDropZone } from "./logoDrag";
import { LogoTile, PendingTile, type LogoActions } from "./LogoTile";
import { Section, SmallAction } from "./Section";

/** Cuántos archivos se suben a la vez. */
const PARALLEL = 4;

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await run(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Target = { group: string | null; into?: BrandLogo };

/**
 * Todos los logos del cliente, cada uno con sus formatos, en grupos. Se sueltan todos los
 * archivos juntos: los que se llaman igual (horizontal.svg, horizontal.png, horizontal.ai) quedan
 * como un mismo logo, y cada formato es una etiqueta que lo descarga. Los grupos se crean a mano
 * y los logos se arrastran de uno a otro. La estrella elige cuál es su logo en toda la app.
 */
export function LogosSection({
  brand,
  save,
  missing,
}: {
  brand: Brand;
  save: (patch: BrandPatch, done?: string) => Promise<boolean>;
  /** Falta correr migracion-logos.sql. */
  missing: boolean;
}) {
  const confirm = useConfirm();
  const logos = useMemo(() => brand.logos ?? [], [brand.logos]);
  const groups = useMemo(() => brand.logo_groups ?? [], [brand.logo_groups]);
  const [filter, setFilter] = useState<LogoFormat | null>(null);
  /** Los logos nuevos que se están subiendo (todavía sin archivos). */
  const [pending, setPending] = useState<BrandLogo[]>([]);
  /** Los logos que están recibiendo archivos. */
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<Target>({ group: null });

  // Al soltar un logo en otro grupo se vuelve a montar en otro lado, y su dragend no llega: se limpia con cualquiera.
  useEffect(() => {
    const clear = () => setDragging(null);
    window.addEventListener("drop", clear, true);
    window.addEventListener("dragend", clear, true);
    return () => {
      window.removeEventListener("drop", clear, true);
      window.removeEventListener("dragend", clear, true);
    };
  }, []);

  const counts = useMemo(() => formatCounts(logos), [logos]);
  const only = filter && counts.some(([f]) => f === filter) ? filter : null;
  const visible = useMemo(() => (only ? logos.filter((l) => l.files.some((f) => f.format === only)) : logos), [logos, only]);
  const fileCount = visible.reduce((n, l) => n + (only ? 1 : l.files.length), 0);
  const face = faceAsLogo(brand);
  const faceMissing = !missing && !!face && !logos.some((l) => l.files.some((f) => f.path === brand.logo_path));

  /* ───────── guardar ─────────
     Cada cambio parte del cliente como está ahora (no del de la última vez que se pintó), y los
     archivos que dejan de usarse se borran del bucket recién cuando la base guardó. */

  const commit = useCallback(
    async (make: (current: Brand) => BrandPatch | null, done?: string) => {
      const before = getClient(brand.id);
      if (!before) return false;
      const patch = make(before);
      if (!patch) return false;
      const ok = await save(patch, done);
      if (ok) brandsRepo.removeLogoFiles(orphanedPaths(before, { ...before, ...patch }));
      return ok;
    },
    [brand.id, save]
  );

  const setLogos = (make: (logos: BrandLogo[], current: Brand) => BrandLogo[], done?: string) =>
    commit((b) => ({ logos: make(b.logos ?? [], b) }), done);
  const setGroups = (make: (groups: LogoGroup[]) => LogoGroup[], done?: string) =>
    commit((b) => ({ logo_groups: make(b.logo_groups ?? []) }), done);
  const updateLogo = (id: string, change: Partial<BrandLogo>, done?: string) =>
    setLogos((list) => list.map((l) => (l.id === id ? { ...l, ...change } : l)), done);

  /* ───────── subir ───────── */

  const upload = async (files: File[], to: Target) => {
    if (missing) return toast("Para subir varios logos falta correr supabase/migracion-logos.sql en Supabase", "error");
    const problems = files.map(logoFileProblem).filter((p): p is string => !!p);
    const good = files.filter((f) => !logoFileProblem(f));
    if (problems.length) toast(problems.length === 1 ? problems[0] : `${problems.length} archivos no son logos (${problems[0]}…)`, "error");
    const current = getClient(brand.id);
    if (!good.length || !current) return;

    const plan = planUpload(good, current.logos ?? [], { group: to.group, into: to.into?.id, brandName: current.name });
    const receiving = new Set(plan.items.map((i) => i.target).filter((id) => !plan.fresh.some((f) => f.id === id)));
    setPending((p) => [...p, ...plan.fresh]);
    setBusy((b) => new Set([...b, ...receiving]));

    const errors: { message: string }[] = [];
    const done = await mapLimit(plan.items, PARALLEL, async (item): Promise<Uploaded | null> => {
      const info = LOGO_FORMATS[item.format].preview ? await inspectLogoImage(item.file, item.format === "svg") : {};
      const up = await brandsRepo.uploadLogo(item.file, LOGO_FORMATS[item.format].mime);
      if (up.error) {
        errors.push(up.error);
        return null;
      }
      return {
        target: item.target,
        bg: info.bg,
        file: { format: item.format, path: up.path, url: up.url, name: item.file.name, size: item.file.size, w: info.w, h: info.h },
      };
    });
    const uploaded = done.filter((u): u is Uploaded => !!u);

    if (uploaded.length) {
      const before = getClient(brand.id);
      if (before) {
        const result = applyUploads(before.logos ?? [], plan.fresh, uploaded);
        const patch: BrandPatch = { logos: result.logos };
        // Sin logo arriba, el primero nuevo que se puede mostrar pasa a ser su cara.
        const first = before.logo_url ? null : result.created.find((l) => previewOf(l));
        const firstPreview = first && previewOf(first);
        if (first && firstPreview) {
          Object.assign(patch, { logo_url: firstPreview.url, logo_path: firstPreview.path, logo_bg: first.bg });
          if (before.logo_from) patch.logo_from = null;
        }
        const summary = uploadSummary({ created: result.created.length, extra: result.extra, replaced: result.replaced });
        const ok = await save(patch, first ? `${summary} · «${first.name}» quedó como logo de ${before.name}` : summary);
        if (ok) brandsRepo.removeLogoFiles([...orphanedPaths(before, { ...before, ...patch }), ...result.discarded]);
        else brandsRepo.removeLogoFiles(uploaded.map((u) => u.file.path));
      }
    }
    if (errors.length) toast(clientErrorMessage(errors[0]), "error");

    const freshIds = new Set(plan.fresh.map((f) => f.id));
    setPending((p) => p.filter((l) => !freshIds.has(l.id)));
    setBusy((b) => new Set([...b].filter((id) => !receiving.has(id))));
  };

  const pick = (to: Target) => {
    target.current = to;
    fileInput.current?.click();
  };

  /* ───────── descargar ───────── */

  const zipName = (...parts: string[]) => `${safeFileName([brand.name, ...parts].join(" "))}.zip`;

  const downloadZip = async (entries: { path: string; url: string }[], filename: string) => {
    if (!entries.length || zipping) return;
    setZipping(true);
    try {
      const { blob, failed } = await zipLogoFiles(entries);
      saveBlob(blob, filename);
      if (failed) toast(`${plural(failed, "archivo no se pudo", "archivos no se pudieron")} bajar`, "error");
    } catch {
      toast("No se pudo armar el .zip", "error");
    } finally {
      setZipping(false);
    }
  };

  /** Lo que se descarga de esos logos (con el filtro, solo ese formato), cada uno en la carpeta de su grupo. */
  const entriesOf = (list: BrandLogo[], folders: boolean) =>
    list.flatMap((logo) => {
      const folder = folders && logo.group ? `${safeFileName(groups.find((g) => g.id === logo.group)?.name ?? "")}/` : "";
      return logo.files
        .filter((f) => !only || f.format === only)
        .map((file) => ({ path: `${folder}${downloadNameOf(brand.name, logo, file)}`, url: file.url }));
    });

  /* ───────── cada logo ───────── */

  const actions: LogoActions = {
    rename: (logo, name) => updateLogo(logo.id, { name }),
    setBg: (logo, bg) =>
      commit((b) => ({
        logos: (b.logos ?? []).map((l) => (l.id === logo.id ? { ...l, bg } : l)),
        // Si es su logo de arriba, el de arriba cambia con él.
        ...(logo.files.some((f) => f.path === b.logo_path) ? { logo_bg: bg } : {}),
      })),
    makeFace: (logo) => {
      const file = previewOf(logo);
      if (!file) return;
      commit(
        (b) => ({ logo_url: file.url, logo_path: file.path, logo_bg: logo.bg, ...(b.logo_from ? { logo_from: null } : {}) }),
        `«${logo.name}» es el logo de ${brand.name}`
      );
    },
    move: (logo, group, before) => {
      const name = group ? groups.find((g) => g.id === group)?.name : null;
      setLogos((list) => moveLogo(list, logo.id, group, before), before ? undefined : name ? `«${logo.name}» a ${name}` : `«${logo.name}» sin grupo`);
    },
    merge: async (from, into) => {
      const { dropped } = mergeLogos(logos, from.id, into.id);
      if (dropped.length) {
        const sure = await confirm({
          title: `¿Juntar «${from.name}» con «${into.name}»?`,
          description: `Los dos tienen ${dropped.map((f) => LOGO_FORMATS[f.format].label).join(", ")}: queda el de «${into.name}» y el otro se borra.`,
          confirmLabel: "Juntar",
        });
        if (!sure) return;
      }
      setLogos((list) => mergeLogos(list, from.id, into.id).logos, `«${from.name}» quedó adentro de «${into.name}»`);
    },
    removeFormat: (logo, format) =>
      setLogos(
        (list) => list.map((l) => (l.id === logo.id ? { ...l, files: l.files.filter((f) => f.format !== format) } : l)),
        `${LOGO_FORMATS[format].label} quitado de «${logo.name}»`
      ),
    remove: async (logo) => {
      const isFace = logo.files.some((f) => f.path === brand.logo_path);
      const sure = await confirm({
        title: `¿Eliminar «${logo.name}»?`,
        description: `Se ${logo.files.length === 1 ? "borra su archivo" : `borran sus ${logo.files.length} archivos`} (${logo.files
          .map((f) => LOGO_FORMATS[f.format].label)
          .join(", ")}).${isFace ? " El logo de arriba queda como está." : ""} No se puede deshacer.`,
        confirmLabel: "Eliminar",
        destructive: true,
      });
      if (sure) setLogos((list) => list.filter((l) => l.id !== logo.id), "Logo eliminado");
    },
    download: (logo, file) => downloadLogoFile(file.url, downloadNameOf(brand.name, logo, file)),
    downloadAll: (logo) =>
      downloadZip(
        logo.files.map((file) => ({ path: downloadNameOf(brand.name, logo, file), url: file.url })),
        zipName(logo.name)
      ),
    addFiles: (logo, files) => upload(files, { group: logo.group, into: logo }),
    dragStart: (logo) => setDragging(logo.id),
    dragEnd: () => setDragging(null),
    dropLogo: (id, before) => {
      const logo = logos.find((l) => l.id === id);
      if (logo) actions.move(logo, before.group, before.id);
    },
  };

  /* ───────── grupos ───────── */

  const createGroup = (name: string) => {
    const current = getClient(brand.id)?.logo_groups ?? [];
    const { groups: next } = addGroup(current, name);
    setGroups(() => next, `Grupo ${next[next.length - 1].name} creado`);
  };

  const removeGroup = async (group: LogoGroup, withLogos: boolean) => {
    const inside = logosIn(logos, group.id);
    if (withLogos) {
      const files = inside.reduce((n, l) => n + l.files.length, 0);
      const sure = await confirm({
        title: `¿Eliminar ${group.name} y sus logos?`,
        description: `Se borran ${plural(inside.length, "logo", "logos")} (${plural(files, "archivo", "archivos")}). No se puede deshacer.`,
        confirmLabel: "Eliminar",
        destructive: true,
      });
      if (!sure) return;
    }
    commit(
      (b) => ({
        logo_groups: (b.logo_groups ?? []).filter((g) => g.id !== group.id),
        logos: (b.logos ?? []).flatMap((l) => (l.group !== group.id ? [l] : withLogos ? [] : [{ ...l, group: null }])),
      }),
      withLogos || !inside.length
        ? `Grupo ${group.name} eliminado`
        : `Grupo ${group.name} eliminado: ${inside.length === 1 ? "su logo quedó" : `sus ${inside.length} logos quedaron`} sin grupo`
    );
  };

  const groupProps = {
    brand,
    logos,
    groups,
    visible,
    pending,
    busy,
    dragging,
    only,
    actions,
    zipping,
    onFiles: (files: File[], group: string | null) => upload(files, { group }),
    onPick: (group: string | null) => pick({ group }),
    onDownload: (list: BrandLogo[], filename: string) => downloadZip(entriesOf(list, false), filename),
    zipName,
  };

  const empty = !logos.length && !pending.length && !groups.length;
  const ungroupedShown = !!groups.length && (logosIn(visible, null).length > 0 || logosIn(pending, null).length > 0 || !!dragging);
  const root = useDropZone({ onFiles: (files) => upload(files, { group: null }) });

  return (
    <Section
      id="logos"
      title="Logos"
      hint="Los archivos que se llaman igual quedan como un logo con todos sus formatos. Cada etiqueta descarga uno."
      action={
        <>
          {fileCount > 1 && (
            <SmallAction onClick={() => downloadZip(entriesOf(visible, true), zipName("logos", only ? LOGO_FORMATS[only].label : ""))} disabled={zipping}>
              {zipping ? <Loader2 className="animate-spin" /> : <Download />}
              <span className="sm:hidden">Descargar</span>
              <span className="hidden sm:inline">{only ? `Descargar los ${LOGO_FORMATS[only].label}` : "Descargar todos"}</span>
            </SmallAction>
          )}
          {!missing && <NewGroup existing={groups} onCreate={createGroup} />}
          <SmallAction onClick={() => pick({ group: null })}>
            <UploadCloud /> <span className="sm:hidden">Subir</span>
            <span className="hidden sm:inline">Subir logos</span>
          </SmallAction>
        </>
      }
    >
      {missing && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-primary/25 px-4 py-3 text-sm">
          <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Para guardar varios logos con sus formatos (y subir PDF, AI o EPS) falta correr{" "}
            <code className="rounded bg-ink/10 px-1 text-[13px]">supabase/migracion-logos.sql</code> en Supabase → SQL Editor.
          </p>
        </div>
      )}

      {faceMissing && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-secondary/60 px-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1">El logo de arriba todavía no está en la lista.</span>
          <button
            type="button"
            onClick={() =>
              commit((b) => {
                const logo = faceAsLogo(b);
                return logo ? { logos: [logo, ...(b.logos ?? [])] } : null;
              }, "El logo de arriba ya está en la lista")
            }
            className="text-xs font-medium underline-offset-2 hover:underline"
          >
            Sumarlo
          </button>
        </div>
      )}

      {counts.length > 1 && (
        <div role="radiogroup" aria-label="Filtrar por formato" className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-1">Formatos</span>
          <FilterChip checked={!only} onClick={() => setFilter(null)}>
            Todos <span className="tabular-nums opacity-60">{logos.length}</span>
          </FilterChip>
          {counts.map(([format, n]) => (
            <FilterChip key={format} checked={only === format} onClick={() => setFilter(only === format ? null : format)}>
              {LOGO_FORMATS[format].label} <span className="tabular-nums opacity-60">{n}</span>
            </FilterChip>
          ))}
        </div>
      )}

      <div {...root.handlers} className="relative">
        {empty ? (
          <button
            type="button"
            onClick={() => pick({ group: null })}
            className={cn(
              "flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-foreground/15 bg-secondary/30 px-4 py-10 text-center text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground",
              root.over && "border-ring bg-primary/10 text-foreground"
            )}
          >
            <ImagePlus className="h-7 w-7 text-foreground/40" />
            <span className="font-medium text-foreground">Soltá acá todos sus logos, o hacé click para elegirlos</span>
            <span className="text-xs">SVG, AI, EPS, PDF, PNG, JPG, WEBP o GIF · hasta 50 MB cada uno</span>
          </button>
        ) : groups.length ? (
          <div className="grid gap-4">
            {groups.map((group, i) => (
              <GroupBlock
                key={group.id}
                {...groupProps}
                group={group}
                first={i === 0}
                last={i === groups.length - 1}
                onRename={(name) => setGroups((list) => list.map((g) => (g.id === group.id ? { ...g, name } : g)))}
                onShift={(by) => setGroups((list) => shiftGroup(list, group.id, by))}
                onRemove={(withLogos) => removeGroup(group, withLogos)}
              />
            ))}
            {ungroupedShown && <GroupBlock {...groupProps} group={null} first={false} last />}
          </div>
        ) : (
          <LogoGrid {...groupProps} group={null} />
        )}
        {root.over && !empty && (
          <span className="pointer-events-none absolute inset-x-0 -bottom-3 mx-auto w-fit rounded-full bg-ink px-3 py-1 text-[11px] font-medium text-cream shadow">
            {groups.length ? "Soltá en un grupo, o acá para dejarlos sin grupo" : "Soltá para sumarlos"}
          </span>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept={LOGO_FILES_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) upload(files, target.current);
        }}
      />
    </Section>
  );
}

type GroupProps = {
  brand: Brand;
  logos: BrandLogo[];
  groups: LogoGroup[];
  visible: BrandLogo[];
  pending: BrandLogo[];
  busy: Set<string>;
  dragging: string | null;
  only: LogoFormat | null;
  actions: LogoActions;
  zipping: boolean;
  onFiles: (files: File[], group: string | null) => void;
  onPick: (group: string | null) => void;
  onDownload: (list: BrandLogo[], filename: string) => void;
  zipName: (...parts: string[]) => string;
};

/** Un grupo: su nombre (editable), sus acciones y sus logos. Se le sueltan archivos o logos. */
function GroupBlock({
  group,
  first,
  last,
  onRename,
  onShift,
  onRemove,
  ...props
}: GroupProps & {
  /** null: los que no tienen grupo. */
  group: LogoGroup | null;
  first: boolean;
  last: boolean;
  onRename?: (name: string) => void;
  onShift?: (by: -1 | 1) => void;
  onRemove?: (withLogos: boolean) => void;
}) {
  const id = group?.id ?? null;
  const items = logosIn(props.visible, id);
  const all = logosIn(props.logos, id);
  const { over, handlers } = useDropZone({
    onFiles: (files) => props.onFiles(files, id),
    onLogo: (logoId) => {
      const logo = props.logos.find((l) => l.id === logoId);
      if (logo && logo.group !== id) props.actions.move(logo, id);
    },
  });
  // Filtrando por formato, un grupo sin ninguno de ese formato no se muestra.
  if (props.only && !items.length && !logosIn(props.pending, id).length) return null;

  const tool = "grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

  return (
    <div
      {...handlers}
      role="group"
      aria-label={group?.name ?? "Sin grupo"}
      className={cn(
        "rounded-[1.4rem] bg-secondary/35 p-3 transition-shadow sm:p-4",
        over && "ring-2 ring-ring ring-offset-2 ring-offset-card",
        !group && "bg-transparent ring-1 ring-inset ring-foreground/10"
      )}
    >
      <header className="mb-3 flex items-center gap-2">
        {group && onRename ? (
          <GroupName name={group.name} onSave={onRename} />
        ) : (
          <p className="eyebrow px-1">Sin grupo</p>
        )}
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{items.length || ""}</span>
        <span className="flex-1" />
        {over && <span className="text-xs font-medium">{over === "files" ? "Soltá para subirlos acá" : "Soltá para moverlo acá"}</span>}
        {items.length > 0 && (
          <Hint label={props.only ? `Descargar los ${LOGO_FORMATS[props.only].label} del grupo` : "Descargar el grupo (.zip)"}>
            <button
              type="button"
              disabled={props.zipping}
              onClick={() => props.onDownload(items, props.zipName(group?.name ?? "sin grupo", props.only ? LOGO_FORMATS[props.only].label : ""))}
              aria-label={`Descargar ${group?.name ?? "los sin grupo"}`}
              className={tool}
            >
              <Download className="h-4 w-4" />
            </button>
          </Hint>
        )}
        {group && onShift && onRemove && (
          <DropdownMenu>
            <Hint label="Opciones del grupo">
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Opciones de ${group.name}`} className={cn(tool, "data-[state=open]:bg-secondary")}>
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
            </Hint>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => props.onPick(group.id)}>
                <UploadCloud /> Subir logos a {group.name}
              </DropdownMenuItem>
              {!first && (
                <DropdownMenuItem onSelect={() => onShift(-1)}>
                  <ArrowUp /> Subir el grupo
                </DropdownMenuItem>
              )}
              {!last && (
                <DropdownMenuItem onSelect={() => onShift(1)}>
                  <ArrowDown /> Bajar el grupo
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onRemove(false)}>
                <Trash2 /> {all.length ? "Eliminar el grupo (los logos quedan)" : "Eliminar el grupo"}
              </DropdownMenuItem>
              {all.length > 0 && (
                <DropdownMenuItem onSelect={() => onRemove(true)} className="text-destructive">
                  <Trash2 /> Eliminar el grupo y sus logos
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <LogoGrid {...props} group={id} />
    </div>
  );
}

/** Los logos de un grupo en grilla, los que se están subiendo y, al final, el lugar para sumar más. */
function LogoGrid({ group, ...props }: GroupProps & { group: string | null }) {
  const items = logosIn(props.visible, group);
  const pending = logosIn(props.pending, group);
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((logo) => (
        <LogoTile
          key={logo.id}
          brand={props.brand}
          logo={logo}
          groups={props.groups}
          others={props.logos.filter((l) => l.id !== logo.id)}
          busy={props.busy.has(logo.id)}
          dragging={props.dragging === logo.id}
          highlight={props.only}
          actions={props.actions}
        />
      ))}
      {pending.map((logo) => (
        <PendingTile key={logo.id} name={logo.name} />
      ))}
      <li>
        <button
          type="button"
          onClick={() => props.onPick(group)}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-foreground/15 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <Plus className="h-5 w-5" />
          Sumar logos
        </button>
      </li>
    </ul>
  );
}

/** El nombre del grupo, editable en el lugar (como el de cada logo). */
function GroupName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  const commit = () => {
    const next = draft?.trim() ?? "";
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (next && next !== name) onSave(next);
  };

  // El campo mide lo que el nombre: una copia invisible le da el ancho.
  const text = "-ml-1 px-1 font-display text-[1.35rem] leading-none";
  return (
    <span className="inline-grid min-w-0 max-w-full">
      <span aria-hidden className={cn(text, "invisible col-start-1 row-start-1 overflow-hidden whitespace-pre")}>
        {(draft ?? name) || " "}{" "}
      </span>
      <input
        value={draft ?? name}
        onFocus={() => setDraft(name)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        maxLength={60}
        aria-label="Nombre del grupo"
        // Sin esto el campo pide su ancho de siempre (20 letras) y la copia no lo achica.
        size={1}
        className={cn(
          text,
          "col-start-1 row-start-1 h-8 w-full min-w-0 rounded-lg bg-transparent outline-none transition-colors hover:bg-secondary/70 focus:bg-card"
        )}
      />
    </span>
  );
}

/** Crear un grupo: un nombre a mano o uno de los de siempre. */
function NewGroup({ existing, onCreate }: { existing: LogoGroup[]; onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const taken = (n: string) => existing.some((g) => g.name.trim().toLowerCase() === n.trim().toLowerCase());
  const suggestions = GROUP_SUGGESTIONS.filter((s) => !taken(s));

  const create = (value: string) => {
    if (!value.trim()) return;
    onCreate(value);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setName("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium shadow-sm transition-colors hover:bg-secondary data-[state=open]:bg-secondary [&_svg]:h-3.5 [&_svg]:w-3.5"
        >
          <FolderPlus /> <span className="sm:hidden">Grupo</span>
          <span className="hidden sm:inline">Nuevo grupo</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create(name);
          }}
          className="flex gap-1.5"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del grupo"
            aria-label="Nombre del grupo"
            maxLength={60}
            autoFocus
            className="h-9 min-w-0 flex-1 rounded-xl border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="h-9 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 disabled:opacity-40"
          >
            Crear
          </button>
        </form>
        {suggestions.length > 0 && (
          <div className="mt-3">
            <p className="eyebrow mb-1.5">Los de siempre</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => create(s)}
                  className="h-7 rounded-full bg-secondary/80 px-2.5 text-xs transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FilterChip({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors",
        checked ? "bg-foreground text-background" : "bg-secondary/80 hover:bg-secondary"
      )}
    >
      {children}
    </button>
  );
}
