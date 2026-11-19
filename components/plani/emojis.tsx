"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { EmojiPanel } from "@/components/redaccion/EmojiPanel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toaster";
import { useBrandKits } from "@/hooks/useBrandKits";
import { slim, useSharedEmojis } from "@/hooks/useSharedEmojis";
import { charFor, variantId, type CategorySummary, type EmojiEntry } from "@/lib/emojis/types";
import type { SlimEmoji } from "@/lib/redaccion/types";

/**
 * Los emojis en Planificación son los mismos de Redacción y del módulo Emojis: el mismo panel, los
 * fijados de cada cliente, los recientes, los favoritos y el tono. Las categorías llegan desde la
 * página (se arman en el servidor).
 */
const Categorias = createContext<CategorySummary[]>([]);

export function PlaniEmojiProvider({ categories, children }: { categories: CategorySummary[]; children: ReactNode }) {
  return <Categorias.Provider value={categories}>{children}</Categorias.Provider>;
}

export type EmojiElegido = { char: string; id: string; nombre: string };

/** El panel de Emojis para un cliente: elegir inserta; el + lo fija en ese cliente. */
export function EmojiPicker({
  brandId,
  brandName,
  onPick,
  autoFocus,
}: {
  brandId: string | null;
  brandName: string | null;
  onPick: (emoji: EmojiElegido) => void;
  autoFocus?: boolean;
}) {
  const categories = useContext(Categorias);
  const emojis = useSharedEmojis();
  const kits = useBrandKits();
  const kit = kits.kitOf(brandId);
  const donde = brandName ? `en ${brandName}` : "para textos sin cliente";

  return (
    <EmojiPanel
      categories={categories}
      tone={emojis.tone}
      onToneChange={emojis.setTone}
      brandName={brandName}
      brandEmojis={kit.emojis}
      recents={emojis.recents}
      favorites={emojis.favorites}
      autoFocus={autoFocus}
      onInsert={(e: SlimEmoji | EmojiEntry) => {
        onPick({ char: charFor(e, emojis.tone), id: variantId(e, emojis.tone), nombre: e.n });
        emojis.remember(e);
      }}
      onTogglePin={(e: SlimEmoji | EmojiEntry) => {
        const ya = kit.emojis.some((x) => x.i === e.i);
        kits.toggleEmoji(brandId, slim(e));
        toast(ya ? `${e.c} ya no está fijado ${donde}` : `${e.c} fijado ${donde}`);
      }}
    />
  );
}

/** El mismo panel en un popover (para los stickers de historia). */
export function EmojiPopover({
  brandId,
  brandName,
  onPick,
  children,
}: {
  brandId: string | null;
  brandName: string | null;
  onPick: (emoji: EmojiElegido) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="h-[26rem] w-[20rem] p-0 pt-3">
        <EmojiPicker
          brandId={brandId}
          brandName={brandName}
          autoFocus
          onPick={(e) => {
            onPick(e);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
