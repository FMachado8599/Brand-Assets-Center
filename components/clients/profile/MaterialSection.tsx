"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  ChevronDown,
  DatabaseZap,
  Download,
  EyeOff,
  ExternalLink,
  Info,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import type { useBrandMaterials } from "@/hooks/useBrandMaterials";
import { MATERIAL_ACCEPT, MATERIAL_KINDS, formatSize, isImage, kindLabel } from "@/lib/clients/material";
import { materialsRepo } from "@/lib/repos/materials";
import type { Brand, BrandMaterial, MaterialKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MaterialDialog } from "./MaterialDialog";
import { Section, SmallAction } from "./Section";
import { Thumb, aiInfo, openMaterial } from "./materialShared";

/** Cuántos archivos se ven antes de "Ver todos": la sección no se come la página. */
const VISIBLE = 5;

type Filter = "todo" | MaterialKind;

/**
 * El material de marca de un cliente: PDFs, presentaciones, versiones del logo y otros assets. La IA de
 * Redacción lee los textos y las notas para escribir con el tono y el vocabulario de la marca; cada
 * archivo se puede dejar afuera con su interruptor. Todo se sube, se mira y se edita desde acá.
 */
export function MaterialSection({
  brand,
  materials,
}: {
  brand: Brand;
  materials: ReturnType<typeof useBrandMaterials>;
}) {
  const { items, loading, missing, uploads, dismissUpload, addFiles, update, remove } = materials;
  const confirm = useConfirm();
  const picker = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>("todo");
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  /* ───────── miniaturas ───────── */

  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());
  useEffect(() => {
    const need = items.filter((i) => isImage(i) && !requested.current.has(i.file_path)).map((i) => i.file_path);
    if (!need.length) return;
    need.forEach((p) => requested.current.add(p));
    let live = true;
    materialsRepo.signedUrls(need).then((urls) => {
      if (!live) return;
      setThumbs((prev) => {
        const next = { ...prev };
        urls.forEach((url, path) => (next[path] = url));
        return next;
      });
    });
    return () => {
      live = false;
    };
  }, [items]);

  /* ───────── lista ───────── */

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { todo: items.length, documento: 0, presentacion: 0, logo: 0, asset: 0 };
    for (const i of items) out[i.kind]++;
    return out;
  }, [items]);

  const forcedKind = filter === "todo" ? undefined : filter;
  const filtered = forcedKind ? items.filter((i) => i.kind === forcedKind) : items;
  const visible = expanded ? filtered : filtered.slice(0, VISIBLE);
  const editing = items.find((i) => i.id === editingId) ?? null;
  const filterPlural = forcedKind ? MATERIAL_KINDS.find((k) => k.value === forcedKind)!.plural.toLowerCase() : null;

  const pick = () => picker.current?.click();
  const sumar = (files: File[]) => files.length && addFiles(files, forcedKind);

  const askRemove = async (item: BrandMaterial) => {
    const sure = await confirm({
      title: `¿Eliminar «${item.name}»?`,
      description: "Se borra el archivo y la IA deja de leerlo. No se puede deshacer.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!sure) return;
    if (await remove(item)) {
      setEditingId(null);
      toast(`«${item.name}» eliminado`);
    }
  };

  /* ───────── arrastrar y soltar ───────── */

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const drag = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      sumar(Array.from(e.dataTransfer.files));
    },
  };

  return (
    <Section
      id="material"
      title="Material de marca"
      hint={
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden />
          <span>La IA de Redacción lee estos archivos para escribir como {brand.name}.</span>
        </span>
      }
      action={
        <>
          <HowAiUsesIt brandName={brand.name} />
          {!missing && (
            <SmallAction onClick={pick}>
              <Plus /> Sumar{filterPlural ? ` ${filterPlural}` : ""}
            </SmallAction>
          )}
        </>
      }
    >
      <input
        ref={picker}
        type="file"
        multiple
        accept={MATERIAL_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-label="Elegir archivos de material"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          sumar(files);
        }}
      />

      {missing ? (
        <div className="flex items-start gap-3 rounded-2xl bg-primary/25 px-4 py-3 text-sm">
          <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Para guardar material de marca falta un paso en la base: correr{" "}
            <code className="rounded bg-ink/10 px-1 text-[13px]">supabase/migracion-material.sql</code> en Supabase → SQL
            Editor.
          </p>
        </div>
      ) : (
        <div className="relative" {...drag}>
          {dragging && (
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-2 z-10 grid place-items-center rounded-2xl border-2 border-dashed border-foreground/50 bg-primary/40 backdrop-blur-[1px]"
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                <UploadCloud className="h-5 w-5" /> Soltá para sumar {filterPlural ?? "al material"}
              </p>
            </div>
          )}

          {items.length > 0 && (
            <div
              role="group"
              aria-label="Filtrar por tipo"
              className="no-scrollbar -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 py-1"
            >
              {(
                [
                  { value: "todo", label: "Todo" },
                  ...MATERIAL_KINDS.map((k) => ({ value: k.value, label: k.plural })),
                ] as { value: Filter; label: string }[]
              ).map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={filter === f.value}
                  onClick={() => {
                    setFilter(f.value);
                    setExpanded(false);
                  }}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                    filter === f.value
                      ? "bg-foreground text-background"
                      : "bg-secondary/70 hover:bg-secondary",
                    filter !== f.value && !counts[f.value] && "text-muted-foreground"
                  )}
                >
                  {f.label}
                  <span className="tabular-nums opacity-70">{counts[f.value]}</span>
                </button>
              ))}
            </div>
          )}

          {uploads.length > 0 && (
            <ul className="mb-2 grid gap-1.5" aria-live="polite">
              {uploads.map((u) => (
                <li
                  key={u.key}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-dashed px-3 py-2 text-sm",
                    u.stage === "error" && "border-destructive/40 bg-destructive/5"
                  )}
                >
                  {u.stage === "error" ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                  ) : (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {u.stage === "leyendo" ? "Leyendo el texto…" : u.stage === "subiendo" ? "Subiendo…" : u.error}
                    </span>
                  </span>
                  {u.stage === "error" && (
                    <button
                      type="button"
                      onClick={() => dismissUpload(u.key)}
                      aria-label={`Descartar ${u.name}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {loading ? (
            <div className="grid gap-2" aria-busy="true" aria-label="Cargando el material">
              {[0, 1, 2].map((n) => (
                <span key={n} className="skeleton block h-14 rounded-xl" />
              ))}
            </div>
          ) : !items.length ? (
            !uploads.length && (
              <button
                type="button"
                onClick={pick}
                className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-foreground/15 px-6 py-9 text-center transition-colors hover:border-foreground/30 hover:bg-secondary/40"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground">
                  <UploadCloud className="h-6 w-6" aria-hidden />
                </span>
                <span className="text-base font-semibold">Sumá el material de {brand.name}</span>
                <span className="max-w-md text-sm text-muted-foreground">
                  Manuales, presentaciones, PDFs, versiones del logo y otros assets. Arrastralos hasta acá o tocá para
                  elegirlos.
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden /> La IA lee los textos para escribir con el tono de la marca
                </span>
              </button>
            )
          ) : !filtered.length ? (
            <button
              type="button"
              onClick={pick}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-foreground/20 px-4 py-5 text-sm text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
            >
              <Plus className="h-4 w-4" aria-hidden /> Todavía no hay {filterPlural}. Sumá el primero.
            </button>
          ) : (
            <>
              <ul className="-mx-2 divide-y divide-border/70">
                {visible.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    thumb={thumbs[item.file_path]}
                    onEdit={() => setEditingId(item.id)}
                    onToggle={(use_ai) => update(item.id, { use_ai })}
                    onRemove={() => askRemove(item)}
                  />
                ))}
              </ul>
              {filtered.length > VISIBLE && (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} aria-hidden />
                  {expanded ? "Ver menos" : `Ver los ${filtered.length}`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <MaterialDialog
        item={editing}
        thumbUrl={editing ? thumbs[editing.file_path] : undefined}
        onClose={() => setEditingId(null)}
        onSave={update}
        onDelete={askRemove}
      />
    </Section>
  );
}

function Row({
  item,
  thumb,
  onEdit,
  onToggle,
  onRemove,
}: {
  item: BrandMaterial;
  thumb?: string;
  onEdit: () => void;
  onToggle: (useAi: boolean) => void;
  onRemove: () => void;
}) {
  const ai = aiInfo(item);
  const StateIcon = ai.tone === "on" ? Sparkles : ai.tone === "off" ? EyeOff : Info;

  return (
    <li className="flex items-center gap-1 rounded-xl px-2 py-1.5 transition-colors hover:bg-secondary/60 focus-within:bg-secondary/60">
      <button
        type="button"
        onClick={onEdit}
        title="Ver y editar"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-0.5 text-left"
      >
        <Thumb item={item} url={thumb} className="h-11 w-11" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              {kindLabel(item.kind)} · {formatSize(item.size_bytes)}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1",
                ai.tone === "on" && "rounded-full bg-primary/40 px-2 py-px font-medium text-foreground"
              )}
            >
              <StateIcon className="h-3 w-3 shrink-0" aria-hidden />
              {ai.label}
            </span>
          </span>
        </span>
      </button>

      {ai.canToggle && (
        <Switch
          checked={item.use_ai}
          onCheckedChange={onToggle}
          aria-label={`La IA usa «${item.name}»`}
          className="mx-1 before:absolute before:-inset-x-1.5 before:-inset-y-2.5 before:content-['']"
        />
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Más opciones de ${item.name}`}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Ver y editar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openMaterial(item)}>
            <ExternalLink /> Abrir
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openMaterial(item, true)}>
            <Download /> Descargar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onRemove} className="text-destructive data-[highlighted]:bg-destructive/10">
            <Trash2 /> Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** Explica, sin vueltas, qué hace la IA con lo que se sube (incluido que los textos viajan a OpenAI). */
function HowAiUsesIt({ brandName }: { brandName: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary [&_svg]:h-3.5 [&_svg]:w-3.5"
        >
          <Sparkles aria-hidden /> ¿Cómo lo usa la IA?
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2.5 p-4 leading-relaxed">
        <p className="font-semibold">Cómo aprende la IA de {brandName}</p>
        <ul className="list-disc space-y-1.5 pl-4 text-[13px] text-muted-foreground marker:text-foreground/40">
          <li>
            <span className="text-foreground">Lee el texto</span> de los PDFs, presentaciones y documentos, y se queda con
            los fragmentos que vienen al caso con lo que estás escribiendo.
          </li>
          <li>
            <span className="text-foreground">Logos e imágenes no se analizan.</span> Escribí una nota (ej: “versión en
            negativo, para fondos oscuros”) y la IA la tiene en cuenta.
          </li>
          <li>
            <span className="text-foreground">Esos fragmentos viajan a OpenAI</span> para armar las sugerencias. Si hay
            algo que no debería leer, apagá el interruptor de ese archivo.
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
