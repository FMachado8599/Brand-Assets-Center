"use client";

import { useCallback, useState } from "react";
import { Sticker } from "lucide-react";
import { LibrarySwitcher } from "@/components/library/LibrarySwitcher";
import { BarButton, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { toast } from "@/components/ui/toaster";
import { useDebounced } from "@/hooks/useDebounced";
import { usePagedSearch } from "@/hooks/usePagedSearch";
import { useStoredState } from "@/hooks/useStoredState";
import type { Gif, GifFormat, GifKind } from "@/lib/library/gifs";
import { copyGif, copyText, downloadGif, fetchGifs } from "@/lib/library/gifs.client";
import { Loading, MissingKey, MoreButton, SearchError } from "../LibraryParts";
import { Masonry } from "../Masonry";
import { GifDialog } from "./GifDialog";
import { GifTile } from "./GifTile";
import { PoweredByGiphy } from "./PoweredByGiphy";

const ratio = (g: Gif) => g.preview.height / g.preview.width;

/**
 * La librería de GIFs: busca en GIPHY (sin búsqueda, las tendencias), GIFs o stickers (con fondo
 * transparente). Cada uno se copia para pegar en un chat, un mail o una presentación, o se baja en GIF, MP4
 * o WEBP.
 */
export function GifsShell({ configured }: { configured: boolean }) {
  const [kind, setKind] = useStoredState<GifKind>("gifs:tipo", "gifs");
  const [query, setQuery] = useState("");
  // Más demora que en Emojis: cada búsqueda es un pedido a GIPHY, y la key de prueba deja pocos por hora.
  const [debounced] = useDebounced(query.replace(/\s+/g, " ").trim(), 450);
  const [open, setOpen] = useState<Gif | null>(null);

  const load = useCallback((offset: number, signal: AbortSignal) => fetchGifs(kind, debounced, offset, signal), [kind, debounced]);
  const search = usePagedSearch<Gif>(configured ? `${kind}:${debounced}` : null, 0, load);
  const sticker = kind === "stickers";
  const noun = sticker ? "stickers" : "GIFs";

  const copy = async (gif: Gif) => {
    try {
      await copyGif(gif);
      toast(`${sticker ? "Sticker" : "GIF"} copiado: pegalo en Slack, Gmail, Docs o Slides`);
    } catch {
      toast("El navegador no dejó copiar: probá con descargarlo", "error");
    }
  };
  const copyLink = async (gif: Gif) => {
    try {
      await copyText(gif.page);
      toast("Link de GIPHY copiado");
    } catch {
      toast("El navegador no dejó copiar el link", "error");
    }
  };
  const download = (gif: Gif, format: GifFormat = "gif") => downloadGif(gif, format);

  return (
    <div className="min-h-screen">
      <ContextBar>
        <LibrarySwitcher />
        <BarSearch value={query} onChange={setQuery} placeholder={`Buscar ${noun} en GIPHY…`} busy={search.loading && query.trim() !== ""} />
        {/* Un toggle y no un selector: al lado del de librerías, un segundo "GIFs" confundía. */}
        <BarButton
          label={sticker ? "Volver a GIFs" : "Stickers (con fondo transparente)"}
          icon={Sticker}
          pressed={sticker}
          onClick={() => setKind(sticker ? "gifs" : "stickers")}
        />
      </ContextBar>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-[5.5rem] sm:px-6">
        <h1 className="sr-only">GIFs</h1>
        {!configured && <MissingKey env="GIPHY_API_KEY">La key se saca gratis en developers.giphy.com (ver README, Librerías).</MissingKey>}

        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
          <h2 className="text-sm font-semibold">
            {debounced ? (
              <>
                {noun} de <span className="font-normal text-muted-foreground">“{debounced}”</span>
              </>
            ) : (
              `${sticker ? "Stickers" : "GIFs"} en tendencia`
            )}
          </h2>
          {debounced && search.total > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">{search.total.toLocaleString("es-AR")} resultados</span>
          )}
          {sticker && <span className="text-xs text-muted-foreground">Con fondo transparente</span>}
          <PoweredByGiphy className="ml-auto" />
        </div>

        {search.items.length > 0 && (
          <Masonry
            items={search.items}
            ratio={ratio}
            render={(gif) => (
              <GifTile
                key={gif.id}
                gif={gif}
                sticker={sticker}
                onOpen={() => setOpen(gif)}
                onCopy={() => copy(gif)}
                onDownload={() => download(gif)}
              />
            )}
          />
        )}

        {search.error ? (
          <SearchError message={search.error} onRetry={search.retry} />
        ) : search.loading && search.items.length === 0 ? (
          <Loading />
        ) : configured && !search.loading && search.items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No hay {noun} para “{debounced}”. Probá con otra palabra (en inglés suele encontrar más).
          </p>
        ) : search.next !== null ? (
          <MoreButton loading={search.loading} onClick={search.loadMore} />
        ) : null}
      </main>

      {open && (
        <GifDialog
          gif={open}
          sticker={sticker}
          onOpenChange={(v) => !v && setOpen(null)}
          onCopy={() => copy(open)}
          onCopyLink={() => copyLink(open)}
          onDownload={(format) => download(open, format)}
        />
      )}
    </div>
  );
}
