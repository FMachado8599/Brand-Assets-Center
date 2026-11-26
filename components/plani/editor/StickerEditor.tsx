"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { imageUrl } from "@/lib/emojis/types";
import { STICKERS } from "@/lib/plani/config";
import type { Sticker } from "@/lib/plani/types";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmojiPopover } from "../emojis";
import { stickerNuevo } from "../Stickers";
import { Field, TextInput } from "./fields";

/**
 * Los stickers de una historia: se agregan acá y se acomodan arrastrándolos sobre el mockup.
 * Abajo se editan los textos del que está elegido.
 */
export function StickerEditor({
  brand,
  stickers,
  onChange,
  selected,
  onSelect,
}: {
  brand: Pick<Brand, "id" | "name">;
  stickers: Sticker[];
  onChange: (next: Sticker[]) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const s = stickers.find((x) => x.id === selected) ?? null;
  const patch = (p: Partial<Sticker>) => s && onChange(stickers.map((x) => (x.id === s.id ? { ...x, ...p } : x)));

  return (
    <div className="space-y-3">
      <Field label="Stickers" hint={stickers.length ? "Arrastralos sobre la historia para ubicarlos." : undefined}>
        <div className="flex flex-wrap gap-1.5">
          {STICKERS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                const nuevo = stickerNuevo(t.value);
                onChange([...stickers, nuevo]);
                onSelect(nuevo.id);
              }}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-foreground/[0.08] bg-card px-2.5 text-xs font-medium shadow-sm transition-colors hover:bg-secondary"
            >
              <Plus className="h-3 w-3" /> {t.label}
            </button>
          ))}
        </div>
      </Field>

      {stickers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stickers.map((x, i) => (
            <button
              key={x.id}
              type="button"
              onClick={() => onSelect(x.id === selected ? null : x.id)}
              className={cn(
                "h-7 rounded-full px-2.5 text-xs font-medium transition-colors",
                x.id === selected ? "bg-foreground text-background" : "bg-secondary hover:bg-secondary/70"
              )}
            >
              {i + 1}. {STICKERS.find((t) => t.value === x.tipo)?.label}
            </button>
          ))}
        </div>
      )}

      {s && (
        <div className="space-y-2.5 rounded-2xl bg-secondary/60 p-3">
          <Field
            label={
              s.tipo === "link" ? "Texto del botón" : s.tipo === "mencion" ? "Usuario" : s.tipo === "ubicacion" ? "Lugar" : s.tipo === "reaccion" ? "Texto (opcional)" : "Texto"
            }
          >
            <TextInput value={s.texto ?? ""} onChange={(e) => patch({ texto: e.target.value })} maxLength={80} />
          </Field>
          {s.tipo === "link" && (
            <Field label="Link">
              <TextInput value={s.url ?? ""} onChange={(e) => patch({ url: e.target.value })} placeholder="https://…" />
            </Field>
          )}
          {s.tipo === "encuesta" && (
            <Field label="Opciones">
              <div className="space-y-1.5">
                {(s.opciones ?? []).map((o, i) => (
                  <div key={i} className="flex gap-1.5">
                    <TextInput
                      value={o}
                      onChange={(e) => patch({ opciones: (s.opciones ?? []).map((x, j) => (j === i ? e.target.value : x)) })}
                      maxLength={40}
                    />
                    {(s.opciones?.length ?? 0) > 2 && (
                      <button
                        type="button"
                        aria-label="Sacar opción"
                        onClick={() => patch({ opciones: (s.opciones ?? []).filter((_, j) => j !== i) })}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-card"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {(s.opciones?.length ?? 0) < 4 && (
                  <button
                    type="button"
                    onClick={() => patch({ opciones: [...(s.opciones ?? []), ""] })}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    + Opción
                  </button>
                )}
              </div>
            </Field>
          )}
          {s.tipo === "cuenta" && (
            <Field label="Fecha del evento">
              <TextInput type="date" value={s.fecha ?? ""} onChange={(e) => patch({ fecha: e.target.value })} />
            </Field>
          )}
          {(s.tipo === "slider" || s.tipo === "reaccion") && (
            <Field label="Emoji" hint={`Los fijados de ${brand.name} arriba; el + fija uno nuevo.`}>
              <EmojiPopover brandId={brand.id} brandName={brand.name} onPick={(e) => patch({ emoji: e.char, emojiId: e.id })}>
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-foreground/[0.08] bg-card px-3 text-sm font-medium shadow-sm transition-colors hover:bg-secondary"
                >
                  {s.emojiId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl(s.emojiId)} alt={s.emoji ?? ""} className="h-7 w-7" />
                  ) : (
                    <span className="text-2xl leading-none">{s.emoji || "🙂"}</span>
                  )}
                  Cambiar emoji
                </button>
              </EmojiPopover>
            </Field>
          )}
          <Field label="Tamaño">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={s.escala}
              onChange={(e) => patch({ escala: Number(e.target.value) })}
              className="w-full accent-[hsl(var(--ring))]"
            />
          </Field>
          <button
            type="button"
            onClick={() => {
              onChange(stickers.filter((x) => x.id !== s.id));
              onSelect(null);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" /> Sacar sticker
          </button>
        </div>
      )}
    </div>
  );
}
