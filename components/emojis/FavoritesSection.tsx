"use client";

import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { usePagedEmojis, type EmojiSource } from "@/hooks/usePagedEmojis";
import { EmojiGrid, LoadMore, type TileActions } from "./EmojiGrid";

/**
 * Favoritos del inicio. Los ids viven en localStorage; los datos de cada emoji
 * se piden de a páginas. Se toma la lista al entrar: si quitás uno, desaparece
 * sin volver a pedir todo.
 */
export function FavoritesSection({ favoriteIds, ...actions }: TileActions & { favoriteIds: string[] }) {
  const [snapshot] = useState(favoriteIds);
  const source = useMemo<EmojiSource | null>(() => (snapshot.length ? { kind: "ids", ids: snapshot } : null), [snapshot]);
  const paged = usePagedEmojis(source);

  if (!favoriteIds.length) return <EmptyFavorites />;

  return (
    <>
      <EmojiGrid
        items={paged.items}
        batches={paged.batches}
        pending={paged.pending}
        mode="batch"
        resetKey="favoritos"
        hidden={(id) => !actions.favorites.has(id)}
        {...actions}
      />
      {paged.nextCursor !== null && paged.items.length > 0 && (
        <LoadMore
          remaining={(paged.total ?? 0) - paged.items.length}
          loading={paged.loading}
          onClick={paged.loadMore}
        />
      )}
    </>
  );
}

export function EmptyFavorites() {
  return (
    <div className="flex items-center gap-4 rounded-3xl border border-dashed border-foreground/15 bg-card/60 px-5 py-5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/20">
        <Star className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-medium">Todavía no tenés favoritos</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pasá el mouse por un emoji y tocá la estrella: queda acá, a mano, cada vez que entres.
        </p>
      </div>
    </div>
  );
}
