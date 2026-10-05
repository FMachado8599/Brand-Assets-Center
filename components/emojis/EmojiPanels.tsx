"use client";

import { Home } from "lucide-react";
import { PanelTitle } from "@/components/shell/ContextBar";
import { imageUrl, TONES, type CategorySummary, type Tone } from "@/lib/emojis/types";
import { SIZES, type EmojiSize } from "@/lib/emojis/clipboard";
import { cn } from "@/lib/utils";

type Subgroup = CategorySummary["subgroups"][number];

/** Salto rápido entre categorías desde la barra. */
export function CategoryPanel({
  categories,
  active,
  sub,
  onSelect,
}: {
  categories: CategorySummary[];
  active: CategorySummary | null;
  sub: Subgroup | null;
  onSelect: (category: CategorySummary | null, subgroup?: Subgroup | null) => void;
}) {
  return (
    <div>
      <PanelTitle title="Categorías" />
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "col-span-2 flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-secondary",
            !active && "bg-secondary font-medium"
          )}
        >
          <Home className="h-4 w-4 text-foreground/70" /> Inicio: favoritos y categorías
        </button>
        {categories.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onSelect(c)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px] leading-tight transition-colors hover:bg-secondary",
              active?.key === c.key && "bg-primary/25 font-medium hover:bg-primary/30"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl(c.cover.i)} alt="" className="h-6 w-6 shrink-0" />
            <span className="min-w-0 flex-1">{c.name}</span>
          </button>
        ))}
      </div>

      {active && active.subgroups.length > 1 && (
        <div className="mt-3 border-t pt-3">
          <p className="eyebrow mb-2">{active.name}</p>
          <div className="flex flex-wrap gap-1">
            {active.subgroups.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onSelect(active, sub?.key === s.key ? null : s)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-secondary",
                  sub?.key === s.key && "border-foreground bg-foreground text-background hover:bg-foreground/90"
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ToneDot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span
      className={cn("block h-[18px] w-[18px] rounded-full ring-1 ring-black/10", className)}
      style={{ background: TONES[tone].color }}
    />
  );
}

export function TonePanel({ tone, onChange }: { tone: Tone; onChange: (tone: Tone) => void }) {
  return (
    <div>
      <PanelTitle title="Tono de piel" hint="Se aplica a los emojis de personas y manos." />
      <div className="flex justify-between gap-1">
        {TONES.map((t) => (
          <button
            key={t.tone}
            type="button"
            aria-label={t.label}
            title={t.label}
            onClick={() => onChange(t.tone)}
            className={cn(
              "grid h-10 w-10 place-items-center rounded-full transition-transform hover:scale-110",
              tone === t.tone && "ring-2 ring-foreground ring-offset-2"
            )}
          >
            <ToneDot tone={t.tone} className="h-8 w-8" />
          </button>
        ))}
      </div>
    </div>
  );
}

export type EmojiSettings = {
  size: EmojiSize;
  /** Qué copia un click: el PNG o el carácter. */
  click: "image" | "char";
  tone: Tone;
};

export function SettingsPanel({
  settings,
  onChange,
  canCopyImages,
  hasRecents,
  onClearRecents,
}: {
  settings: EmojiSettings;
  onChange: (next: EmojiSettings) => void;
  canCopyImages: boolean;
  hasRecents: boolean;
  onClearRecents: () => void;
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Ajustes" hint="Se guardan en este navegador." />

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Tamaño del PNG</p>
        <div className="grid grid-cols-4 gap-1 rounded-full bg-secondary p-0.5">
          {SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onChange({ ...settings, size })}
              className={cn(
                "h-7 rounded-full text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:text-foreground",
                settings.size === size && "bg-card text-foreground shadow-sm"
              )}
            >
              {size === 1000 ? "Orig." : size}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          En píxeles. El original mide 1000 px; para redes y presentaciones 512 sobra.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Al hacer click</p>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-0.5">
          {(
            [
              ["image", "Copiar imagen"],
              ["char", "Copiar emoji"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ ...settings, click: value })}
              className={cn(
                "h-7 rounded-full text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                settings.click === value && "bg-card text-foreground shadow-sm"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {!canCopyImages && settings.click === "image" && (
          <p className="text-[11px] text-destructive">Este navegador no copia imágenes: se van a descargar.</p>
        )}
      </div>

      <ul className="space-y-1 rounded-xl bg-secondary/70 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <li>
          <kbd className="rounded border bg-card px-1 font-ui">/</kbd> enfoca el buscador y{" "}
          <kbd className="rounded border bg-card px-1 font-ui">Enter</kbd> copia el primer resultado.
        </li>
        <li>
          <kbd className="rounded border bg-card px-1 font-ui">Ctrl</kbd> + click selecciona varios para bajarlos en un ZIP.
        </li>
        <li>Arrastrá un emoji al escritorio para guardar el PNG grande.</li>
      </ul>

      {hasRecents && (
        <button
          type="button"
          onClick={onClearRecents}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Borrar recientes
        </button>
      )}
    </div>
  );
}
