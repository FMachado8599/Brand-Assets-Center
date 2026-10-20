"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, Download, ExternalLink, Info, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { MATERIAL_KINDS, formatSize, formatWords, isImage } from "@/lib/clients/material";
import { materialsRepo, type MaterialPatch } from "@/lib/repos/materials";
import type { BrandMaterial, MaterialKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { KIND_ICON, Thumb, openMaterial } from "./materialShared";

const NOTE_MAX = 600;
/** De un manual largo se muestra el comienzo: alcanza para ver qué leyó la IA sin colgar la pantalla. */
const PREVIEW_CHARS = 6000;

const NOTE_EXAMPLE: Record<MaterialKind, string> = {
  documento: "Ej: Manual de tono. Hablamos de vos, frases cortas y sin tecnicismos.",
  presentacion: "Ej: Presentación institucional 2025. Lo importante es la propuesta de valor de la segunda lámina.",
  logo: "Ej: Versión horizontal en negativo. Va sobre fondos oscuros, nunca sobre fotos.",
  asset: "Ej: Foto de la campaña de verano. Gente real, luz natural, nada de stock.",
};

/** Ver y editar un archivo del material: nombre, tipo, nota para la IA y si la IA lo usa. */
export function MaterialDialog({
  item,
  thumbUrl,
  onClose,
  onSave,
  onDelete,
}: {
  item: BrandMaterial | null;
  thumbUrl?: string;
  onClose: () => void;
  onSave: (id: string, patch: MaterialPatch) => Promise<boolean>;
  onDelete: (item: BrandMaterial) => Promise<void>;
}) {
  // Mientras el diálogo se cierra con su animación, sigue mostrando el último archivo.
  const last = useRef<BrandMaterial | null>(null);
  if (item) last.current = item;
  const shown = item ?? last.current;

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        {shown && (
          <Form key={shown.id} item={shown} thumbUrl={thumbUrl} onClose={onClose} onSave={onSave} onDelete={onDelete} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Form({
  item,
  thumbUrl,
  onClose,
  onSave,
  onDelete,
}: {
  item: BrandMaterial;
  thumbUrl?: string;
  onClose: () => void;
  onSave: (id: string, patch: MaterialPatch) => Promise<boolean>;
  onDelete: (item: BrandMaterial) => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [kind, setKind] = useState<MaterialKind>(item.kind);
  const [note, setNote] = useState(item.note);
  const [useAi, setUseAi] = useState(item.use_ai);
  const [saving, setSaving] = useState(false);
  const [text, setText] = useState<string | null>(null);

  const hasText = item.text_chars > 0;
  const hasContent = hasText || note.trim().length > 0;
  const cleanName = name.trim();

  const patch: MaterialPatch = {};
  if (cleanName && cleanName !== item.name) patch.name = cleanName;
  if (kind !== item.kind) patch.kind = kind;
  if (note.trim() !== item.note) patch.note = note.trim();
  if (useAi !== item.use_ai) patch.use_ai = useAi;
  const dirty = Object.keys(patch).length > 0;

  const submit = async () => {
    if (!cleanName) return;
    if (!dirty) return onClose();
    setSaving(true);
    const ok = await onSave(item.id, patch);
    setSaving(false);
    if (ok) onClose();
  };

  const loadText = () => {
    if (text !== null) return;
    materialsRepo.text(item.id).then((t) => setText(t.length > PREVIEW_CHARS ? `${t.slice(0, PREVIEW_CHARS)}…` : t));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex min-h-0 flex-1 flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>Material de marca</DialogTitle>
        <DialogDescription>Cambiá el nombre, el tipo o contale a la IA qué es este archivo.</DialogDescription>
      </DialogHeader>

      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 pb-1">
        <div className="flex items-center gap-4">
          <Thumb item={item} url={thumbUrl} className="h-24 w-24 rounded-2xl" iconClass="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={item.file_name}>
              {item.file_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatSize(item.size_bytes)} · sumado el{" "}
              {new Date(item.created_at).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => openMaterial(item)}>
                <ExternalLink /> Abrir
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => openMaterial(item, true)}>
                <Download /> Descargar
              </Button>
            </div>
          </div>
        </div>

        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Nombre</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
            className="h-10 rounded-xl border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0"
          />
        </label>

        <KindPicker value={kind} onChange={setKind} />

        <div className="grid gap-1.5">
          <label htmlFor={`nota-${item.id}`} className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Nota para la IA
            <span className="font-normal text-muted-foreground">· opcional</span>
          </label>
          <textarea
            id={`nota-${item.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder={NOTE_EXAMPLE[kind]}
            aria-describedby={`nota-ayuda-${item.id}`}
            className="resize-none rounded-xl border bg-background px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0"
          />
          <p id={`nota-ayuda-${item.id}`} className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span>La IA la lee al escribir para este cliente. Sirve sobre todo para logos e imágenes, que no tienen texto.</span>
            <span className="shrink-0 tabular-nums">
              {note.length}/{NOTE_MAX}
            </span>
          </p>
        </div>

        <div className="grid gap-2 rounded-2xl bg-secondary/50 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`ia-${item.id}`} className="min-w-0 text-sm font-medium">
              La IA usa este archivo
            </label>
            <Switch id={`ia-${item.id}`} checked={useAi && hasContent} disabled={!hasContent} onCheckedChange={setUseAi} />
          </div>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            {hasText ? (
              <>
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>Le leí {formatWords(item.text_chars)}.</span>
              </>
            ) : (
              <>
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  {isImage(item)
                    ? "Las imágenes no se leen. Escribí una nota para que la IA las tenga en cuenta."
                    : "No encontré texto para leer (puede ser un escaneo o un archivo de diseño). Escribí una nota para que la IA lo tenga en cuenta."}
                </span>
              </>
            )}
          </p>
          {hasText && (
            <details onToggle={(e) => e.currentTarget.open && loadText()} className="group text-xs">
              <summary className="cursor-pointer select-none rounded font-medium underline-offset-2 hover:underline">
                Ver el texto que lee la IA
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-card p-3 font-sans leading-relaxed">
                {text ?? "Cargando…"}
              </pre>
            </details>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onDelete(item)}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 /> Eliminar
        </Button>
        <span className="flex-1" />
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving || !cleanName || !dirty}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

/** El tipo del archivo: cuatro opciones, con flechas del teclado como cualquier grupo de radio. */
function KindPicker({ value, onChange }: { value: MaterialKind; onChange: (kind: MaterialKind) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (e: KeyboardEvent, index: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = MATERIAL_KINDS[(index + step + MATERIAL_KINDS.length) % MATERIAL_KINDS.length].value;
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="grid gap-1.5">
      <span id="material-tipo" className="text-sm font-medium">
        Tipo
      </span>
      <div role="radiogroup" aria-labelledby="material-tipo" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MATERIAL_KINDS.map((k, i) => {
          const Icon = KIND_ICON[k.value];
          const on = value === k.value;
          return (
            <button
              key={k.value}
              ref={(el) => {
                refs.current[k.value] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(k.value)}
              onKeyDown={(e) => move(e, i)}
              className={cn(
                "flex h-10 items-center justify-center gap-1.5 rounded-xl border px-2 text-sm transition-colors",
                on ? "border-foreground bg-foreground font-medium text-background" : "bg-card hover:bg-secondary"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{k.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
