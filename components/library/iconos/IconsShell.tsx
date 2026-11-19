"use client";

import { useCallback, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { LibrarySwitcher } from "@/components/library/LibrarySwitcher";
import { BarPopover, BarSearch, ContextBar, PanelTitle } from "@/components/shell/ContextBar";
import { toast } from "@/components/ui/toaster";
import { useDebounced } from "@/hooks/useDebounced";
import { usePagedSearch } from "@/hooks/usePagedSearch";
import { useStoredState } from "@/hooks/useStoredState";
import { PNG_SIZES, SHAPES, type Icon, type PngSize, type Shape } from "@/lib/library/iconos";
import { copyPng, copySvg, downloadIcon, fetchIcons } from "@/lib/library/iconos.client";
import { cn } from "@/lib/utils";
import { Loading, MissingKey, MoreButton, SearchError } from "../LibraryParts";
import { IconDialog, type IconAction } from "./IconDialog";
import { IconTile } from "./IconTile";

type IconSettings = { shape: Shape; size: PngSize };
const DEFAULT_SETTINGS: IconSettings = { shape: "", size: 512 };

/**
 * La librería de Íconos: busca en Magnific (millones de íconos, de Flaticon). Buscar no gasta nada; copiar o
 * bajar un ícono sí cuenta como una descarga del plan. El SVG se copia como código (Figma e Illustrator lo
 * pegan en vectores) y el PNG como imagen.
 */
export function IconsShell({ configured }: { configured: boolean }) {
  const [settings, setSettings] = useStoredState<IconSettings>("iconos:ajustes", DEFAULT_SETTINGS);
  const shape = SHAPES.some((s) => s.value === settings.shape) ? settings.shape : "";
  const size = PNG_SIZES.includes(settings.size) ? settings.size : 512;
  const [query, setQuery] = useState("");
  const [debounced] = useDebounced(query.replace(/\s+/g, " ").trim(), 350);
  const [open, setOpen] = useState<Icon | null>(null);
  const [busy, setBusy] = useState<{ id: number; action: IconAction } | null>(null);

  const load = useCallback((page: number, signal: AbortSignal) => fetchIcons(debounced, shape, page, signal), [debounced, shape]);
  const search = usePagedSearch<Icon>(configured ? `${shape}:${debounced}` : null, 1, load);

  const run = async (icon: Icon, action: IconAction) => {
    if (busy) return;
    setBusy({ id: icon.id, action });
    try {
      if (action.kind === "download") await downloadIcon(icon, action.format, size);
      else if (action.format === "svg") {
        await copySvg(icon);
        toast("SVG copiado: pegalo en Figma o Illustrator");
      } else {
        await copyPng(icon, size);
        toast(`PNG de ${size} px copiado`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen">
      <ContextBar>
        <LibrarySwitcher />
        <BarSearch value={query} onChange={setQuery} placeholder="Buscar íconos…" busy={search.loading && query.trim() !== ""} />
        <BarPopover label="Estilo y tamaño" icon={SlidersHorizontal} highlight={shape !== ""} className="w-72">
          <PanelTitle title="Estilo" hint="Filtra los resultados de Magnific." />
          <div role="radiogroup" aria-label="Estilo" className="mb-4 grid grid-cols-2 gap-1.5">
            {SHAPES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={shape === s.value}
                onClick={() => setSettings((prev) => ({ ...prev, shape: s.value }))}
                className={cn(
                  "h-9 rounded-full border px-3 text-sm transition-colors",
                  shape === s.value ? "border-ink bg-ink text-cream" : "bg-card hover:bg-secondary"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <PanelTitle title="PNG" hint="El tamaño con que se copian y bajan los PNG." />
          <div role="radiogroup" aria-label="Tamaño del PNG" className="flex gap-1">
            {PNG_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={size === s}
                onClick={() => setSettings((prev) => ({ ...prev, size: s }))}
                className={cn(
                  "h-8 flex-1 rounded-full border text-xs font-medium tabular-nums transition-colors",
                  size === s ? "border-ink bg-ink text-cream" : "bg-card hover:bg-secondary"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </BarPopover>
      </ContextBar>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-[5.5rem] sm:px-6">
        <h1 className="sr-only">Íconos</h1>
        {!configured && <MissingKey env="MAGNIFIC_API_KEY">Es la misma key de Retoque (ver README, Librerías).</MissingKey>}

        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
          <h2 className="text-sm font-semibold">
            {debounced ? (
              <>
                Íconos de <span className="font-normal text-muted-foreground">“{debounced}”</span>
              </>
            ) : (
              "Íconos destacados"
            )}
          </h2>
          {debounced && search.total > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">{search.total.toLocaleString("es-AR")} resultados</span>
          )}
          {shape && <span className="text-xs text-muted-foreground">{SHAPES.find((s) => s.value === shape)?.label}</span>}
          <span className="ml-auto text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">Íconos de Magnific</span>
        </div>

        {search.items.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2.5 sm:gap-3">
            {search.items.map((icon) => (
              <IconTile
                key={icon.id}
                icon={icon}
                busy={busy?.id === icon.id}
                size={size}
                onOpen={() => setOpen(icon)}
                onAction={(action) => run(icon, action)}
              />
            ))}
          </ul>
        )}

        {search.error ? (
          <SearchError message={search.error} onRetry={search.retry} />
        ) : search.loading && search.items.length === 0 ? (
          <Loading />
        ) : configured && !search.loading && search.items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No hay íconos para “{debounced}”. Probá con otra palabra o en inglés.</p>
        ) : search.next !== null ? (
          <MoreButton loading={search.loading} onClick={search.loadMore} />
        ) : null}
      </main>

      {open && (
        <IconDialog
          icon={open}
          size={size}
          onSize={(s) => setSettings((prev) => ({ ...prev, size: s }))}
          busy={busy?.id === open.id ? busy.action : null}
          onAction={(action) => run(open, action)}
          onOpenChange={(v) => !v && setOpen(null)}
        />
      )}
    </div>
  );
}
