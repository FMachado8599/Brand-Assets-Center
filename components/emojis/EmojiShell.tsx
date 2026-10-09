"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, ClipboardCopy, Download, LayoutGrid, Loader2, Settings2, Sparkles, X } from "lucide-react";
import {
  BarAction,
  BarButton,
  BarDivider,
  BarPopover,
  BarSearch,
  ContextBar,
} from "@/components/shell/ContextBar";
import { toast } from "@/components/ui/toaster";
import { useDebounced } from "@/hooks/useDebounced";
import { usePagedEmojis, type EmojiSource } from "@/hooks/usePagedEmojis";
import { useStoredState } from "@/hooks/useStoredState";
import { canCopyImages, copyEmojiImage, copyEmojiText, downloadEmoji, downloadZip } from "@/lib/emojis/clipboard";
import { charFor, fileName, imageUrl, variantId, type CategorySummary, type EmojiEntry } from "@/lib/emojis/types";
import { cn } from "@/lib/utils";
import { CategoryGrid } from "./CategoryGrid";
import { EmojiGrid, LoadMore, type TileActions } from "./EmojiGrid";
import { CategoryPanel, SettingsPanel, ToneDot, TonePanel, type EmojiSettings } from "./EmojiPanels";
import { EmptyFavorites, FavoritesSection } from "./FavoritesSection";

const DEFAULT_SETTINGS: EmojiSettings = { size: 512, click: "image", tone: 0 };
const MAX_RECENTS = 16;

type Subgroup = CategorySummary["subgroups"][number];
type Paged = ReturnType<typeof usePagedEmojis>;

/**
 * Los recientes se guardan con sus datos (sin las etiquetas, que solo sirven
 * para buscar): así se muestran al toque y se actualizan apenas copiás uno,
 * sin pedir nada al servidor.
 */
type RecentEntry = Omit<EmojiEntry, "t" | "u">;

const slim = ({ i, c, n, e, g, s, k }: EmojiEntry): RecentEntry => ({ i, c, n, e, g, s, ...(k ? { k } : {}) });

function isRecent(value: unknown): value is RecentEntry {
  const r = value as RecentEntry | null;
  return !!r && typeof r === "object" && typeof r.i === "string" && typeof r.c === "string" && typeof r.n === "string";
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/**
 * Tres vistas:
 *  - inicio: favoritos + recientes + categorías (no se pide ningún listado),
 *  - categoría (?c=…): sus emojis de a páginas, cada página aparece entera,
 *  - búsqueda: resultados de a páginas, apareciendo en orden.
 */
export function EmojiShell({ categories }: { categories: CategorySummary[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const active = categories.find((c) => c.key === params.get("c")) ?? null;
  const sub = active?.subgroups.find((s) => s.key === params.get("s")) ?? null;
  const totalEmojis = useMemo(() => categories.reduce((n, c) => n + c.count, 0), [categories]);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useDebounced(query.trim(), 250);
  const searching = debounced.length > 0;

  // Borrar la búsqueda vuelve a la vista anterior al toque, sin esperar la demora.
  useEffect(() => {
    if (!query.trim()) setDebounced("");
  }, [query, setDebounced]);

  const [settings, setSettings] = useStoredState<EmojiSettings>("emojis:ajustes", DEFAULT_SETTINGS);
  const [favorites, setFavorites, favoritesLoaded] = useStoredState<string[]>("emojis:favoritos", []);
  const [storedRecents, setRecents] = useStoredState<RecentEntry[]>("emojis:recientes", []);
  const [selection, setSelection] = useState<EmojiEntry[]>([]);
  const [zipping, setZipping] = useState<number | null>(null);
  const [copyImages, setCopyImages] = useState(true);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const { tone, size } = settings;

  useEffect(() => setCopyImages(canCopyImages()), []);

  // La búsqueda tiene prioridad; si no, la categoría abierta. En el inicio no se lista nada.
  const source = useMemo<EmojiSource | null>(() => {
    if (searching) return { kind: "search", q: debounced };
    if (active) return { kind: "group", group: active.id, subgroup: sub?.id ?? null, total: sub?.count ?? active.count };
    return null;
  }, [searching, debounced, active, sub]);
  const paged = usePagedEmojis(source);

  /* ───────── navegación ───────── */

  const openCategory = useCallback(
    (category: CategorySummary | null, subgroup: Subgroup | null = null) => {
      setQuery("");
      setDebounced("");
      setCategoriesOpen(false);
      const qs = new URLSearchParams();
      if (category) qs.set("c", category.key);
      if (subgroup) qs.set("s", subgroup.key);
      const href = qs.toString() ? `/emojis?${qs}` : "/emojis";
      // Cambiar de subcategoría reemplaza el historial; entrar o salir de una categoría lo suma (así anda "atrás").
      if (category && active?.key === category.key) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [router, active, setDebounced]
  );

  /* ───────── acciones sobre emojis ───────── */

  // Lo guardado puede venir de una versión vieja (solo ids): se descarta lo que no tenga forma de emoji.
  const recents = useMemo<EmojiEntry[]>(
    () => (Array.isArray(storedRecents) ? storedRecents : []).filter(isRecent).map((r) => ({ ...r, t: [], u: [] })),
    [storedRecents]
  );
  const recentBatches = useMemo(() => [recents.length], [recents.length]);

  /** Cada emoji que copiás o bajás pasa al frente de los recientes. */
  const remember = useCallback(
    (emoji: EmojiEntry) =>
      setRecents((prev) =>
        [slim(emoji), ...(Array.isArray(prev) ? prev : []).filter((r) => isRecent(r) && r.i !== emoji.i)].slice(0, MAX_RECENTS)
      ),
    [setRecents]
  );

  const download = useCallback(
    async (emoji: EmojiEntry) => {
      try {
        await downloadEmoji(variantId(emoji, tone), size, fileName(emoji, tone));
        remember(emoji);
      } catch {
        toast("No se pudo descargar el emoji", "error");
      }
    },
    [tone, size, remember]
  );

  const activate = useCallback(
    async (emoji: EmojiEntry) => {
      const id = variantId(emoji, tone);
      try {
        if (settings.click === "char") {
          await copyEmojiText(charFor(emoji, tone));
          toast(`Copiado ${charFor(emoji, tone)} como texto`);
        } else if (copyImages) {
          await copyEmojiImage(id, size);
          toast(`Copiado: ${emoji.n} · ${size === 1000 ? "original" : `${size} px`}`);
        } else {
          await downloadEmoji(id, size, fileName(emoji, tone));
          toast("Este navegador no copia imágenes: lo descargamos");
        }
        remember(emoji);
      } catch (e) {
        // Si el portapapeles se niega (permisos, foco), que al menos se baje el archivo.
        try {
          await downloadEmoji(id, size, fileName(emoji, tone));
          toast("No se pudo copiar: lo descargamos", "error");
          remember(emoji);
        } catch {
          toast("No se pudo copiar ni descargar el emoji", "error");
          throw e;
        }
      }
    },
    [tone, size, settings.click, copyImages, remember]
  );

  const toggleFavorite = useCallback(
    (emoji: EmojiEntry) =>
      setFavorites((prev) => (prev.includes(emoji.i) ? prev.filter((id) => id !== emoji.i) : [...prev, emoji.i])),
    [setFavorites]
  );

  const toggleSelect = useCallback(
    (emoji: EmojiEntry) =>
      setSelection((prev) => (prev.some((e) => e.i === emoji.i) ? prev.filter((e) => e.i !== emoji.i) : [...prev, emoji])),
    []
  );

  const downloadSelection = async () => {
    const items = selection.map((e) => ({ id: variantId(e, tone), name: fileName(e, tone) }));
    setZipping(0);
    try {
      await downloadZip(items, size, setZipping);
      toast(`Descargados ${items.length} emojis en un ZIP`);
      setSelection([]);
    } catch {
      toast("No se pudo armar el ZIP", "error");
    } finally {
      setZipping(null);
    }
  };

  const copySelectionAsText = async () => {
    await copyEmojiText(selection.map((e) => charFor(e, tone)).join(""));
    toast(`Copiados ${selection.length} emojis como texto`);
  };

  // Esc suelta la selección.
  useEffect(() => {
    if (!selection.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isTyping(e.target)) setSelection([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection.length]);

  // Enter copia el primer resultado. Si la búsqueda todavía no salió, sale ya y se copia al llegar.
  const pendingCopy = useRef<string | null>(null);
  const copyFirst = () => {
    const q = query.trim();
    if (!q) return;
    if (q === debounced && !paged.loading && paged.items[0]) {
      activate(paged.items[0]).catch(() => {});
      return;
    }
    pendingCopy.current = q;
    setDebounced(q);
  };
  useEffect(() => {
    if (!pendingCopy.current || pendingCopy.current !== debounced || paged.loading) return;
    pendingCopy.current = null;
    if (paged.items[0]) activate(paged.items[0]).catch(() => {});
  }, [debounced, paged.loading, paged.items, activate]);

  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const selSet = useMemo(() => new Set(selection.map((e) => e.i)), [selection]);
  const actions: TileActions = {
    tone,
    favorites: favSet,
    selected: selSet,
    selecting: selection.length > 0,
    onActivate: activate,
    onToggleFavorite: toggleFavorite,
    onToggleSelect: toggleSelect,
    onDownload: download,
  };

  const busy = query.trim() !== debounced || paged.searching;

  return (
    <>
      <ContextBar>
        <BarSearch
          value={query}
          onChange={setQuery}
          placeholder={`Buscar entre ${totalEmojis} emojis…`}
          onEnter={copyFirst}
          busy={busy && query.trim().length > 0}
        />
        <BarDivider />
        <BarPopover
          label="Categorías"
          icon={LayoutGrid}
          highlight={!!active && !searching}
          className="w-80"
          open={categoriesOpen}
          onOpenChange={setCategoriesOpen}
        >
          <CategoryPanel categories={categories} active={active} sub={sub} onSelect={openCategory} />
        </BarPopover>
        <BarPopover label="Tono de piel" glyph={<ToneDot tone={tone} />}>
          <TonePanel tone={tone} onChange={(t) => setSettings((prev) => ({ ...prev, tone: t }))} />
        </BarPopover>
        <BarPopover label="Ajustes" icon={Settings2} className="w-80">
          <SettingsPanel
            settings={settings}
            onChange={setSettings}
            canCopyImages={copyImages}
            hasRecents={recents.length > 0}
            onClearRecents={() => setRecents([])}
          />
        </BarPopover>
        {selection.length > 0 && (
          <>
            <BarDivider />
            <BarButton label="Copiar como texto" icon={ClipboardCopy} onClick={copySelectionAsText} />
            <BarAction
              label={`Descargar ${selection.length}`}
              icon={zipping !== null ? Loader2 : Download}
              onClick={downloadSelection}
              disabled={zipping !== null}
              className={zipping !== null ? "[&_svg]:animate-spin" : undefined}
            >
              {zipping !== null ? `${zipping}/${selection.length}` : `ZIP · ${selection.length}`}
            </BarAction>
            <BarButton label="Soltar selección (Esc)" icon={X} onClick={() => setSelection([])} />
          </>
        )}
      </ContextBar>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-[5.5rem] sm:px-6">
        <h1 className="sr-only">Emojis</h1>

        {searching ? (
          <section>
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
              <h2 className="text-sm font-semibold">
                {paged.searching ? (
                  <>
                    Buscando <span className="font-normal text-muted-foreground">“{debounced}”…</span>
                  </>
                ) : paged.total ? (
                  <>
                    {paged.total} {paged.total === 1 ? "resultado" : "resultados"}
                    <span className="font-normal text-muted-foreground"> para “{debounced}”</span>
                  </>
                ) : (
                  "Sin resultados"
                )}
              </h2>
              {!paged.searching && paged.mode && <SearchMode mode={paged.mode} />}
              {!!paged.total && (
                <span className="text-xs text-muted-foreground">
                  <kbd className="rounded border bg-card px-1 font-ui">Enter</kbd> copia el primero
                </span>
              )}
            </div>
            {!paged.searching && paged.total === 0 && !paged.error ? (
              <div className="rounded-3xl border border-dashed border-foreground/10 bg-card/70 px-6 py-14 text-center">
                <p className="font-medium">No encontramos “{debounced}”</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Probá con otra palabra, en español o en inglés: “risa”, “party”, “ok”.
                </p>
              </div>
            ) : (
              <EmojiList paged={paged} mode="ordered" highlightFirst actions={actions} />
            )}
          </section>
        ) : active ? (
          <section>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => openCategory(null)}
                className="flex h-9 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-medium shadow-sm transition-colors hover:bg-secondary"
              >
                <ArrowLeft className="h-4 w-4" /> Categorías
              </button>
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(active.cover.i)} alt="" className="h-7 w-7" />
                <h2 className="font-display text-3xl leading-none">{active.name}</h2>
                <span className="text-sm tabular-nums text-muted-foreground">{sub ? sub.count : active.count}</span>
              </div>
            </div>
            {active.subgroups.length > 1 && (
              <div className="mb-5 flex flex-wrap gap-1.5">
                <Chip on={!sub} onClick={() => openCategory(active, null)}>
                  Todos
                </Chip>
                {active.subgroups.map((s) => (
                  <Chip key={s.key} on={sub?.key === s.key} onClick={() => openCategory(active, s)}>
                    {s.name}
                  </Chip>
                ))}
              </div>
            )}
            <EmojiList paged={paged} mode="batch" actions={actions} />
          </section>
        ) : (
          <div className="flex flex-col gap-10">
            <section>
              <SectionTitle title="Favoritos" count={favoritesLoaded && favorites.length ? favorites.length : undefined} />
              {favoritesLoaded &&
                (favorites.length ? <FavoritesSection favoriteIds={favorites} {...actions} /> : <EmptyFavorites />)}
            </section>
            {recents.length > 0 && (
              <section>
                <SectionTitle title="Recientes" count={recents.length} />
                <EmojiGrid
                  items={recents}
                  batches={recentBatches}
                  pending={0}
                  mode="batch"
                  resetKey="recientes"
                  {...actions}
                />
              </section>
            )}
            <section>
              <SectionTitle title="Categorías" count={categories.length} />
              <CategoryGrid categories={categories} onSelect={(c) => openCategory(c)} />
            </section>
          </div>
        )}
      </main>
    </>
  );
}

/** Grilla + "Cargar más" + errores de un listado paginado. */
function EmojiList({
  paged,
  mode,
  highlightFirst,
  actions,
}: {
  paged: Paged;
  mode: "batch" | "ordered";
  highlightFirst?: boolean;
  actions: TileActions;
}) {
  if (paged.error && !paged.items.length) return <ListError message={paged.error} onRetry={paged.retry} />;
  return (
    <>
      <EmojiGrid
        items={paged.items}
        batches={paged.batches}
        pending={paged.pending}
        mode={mode}
        resetKey={paged.key}
        highlightFirst={highlightFirst}
        {...actions}
      />
      {paged.error ? (
        <div className="mt-6">
          <ListError message={paged.error} onRetry={paged.retry} />
        </div>
      ) : (
        paged.nextCursor !== null &&
        paged.items.length > 0 && (
          <LoadMore
            remaining={(paged.total ?? 0) - paged.items.length}
            loading={paged.loading}
            onClick={paged.loadMore}
          />
        )
      )}
    </>
  );
}

function ListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-card px-4 py-3 text-sm">
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
      <span className="flex-1 text-muted-foreground">No se pudieron cargar los emojis ({message}).</span>
      <button type="button" onClick={onRetry} className="rounded-full px-3 py-1 font-medium hover:bg-secondary">
        Reintentar
      </button>
    </div>
  );
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <h2 className="mb-4 flex items-baseline gap-2.5 px-1 font-display text-3xl leading-none">
      {title}
      {count !== undefined && <span className="eyebrow tabular-nums">{count}</span>}
    </h2>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border bg-card/80 px-3 py-1 text-xs font-medium transition-colors hover:bg-secondary",
        on && "border-foreground bg-foreground text-background hover:bg-foreground/90"
      )}
    >
      {children}
    </button>
  );
}

function SearchMode({ mode }: { mode: "hybrid" | "keywords" }) {
  return mode === "hybrid" ? (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Sparkles className="h-3 w-3" /> Por palabras y significado
    </span>
  ) : (
    <span className="text-xs text-muted-foreground" title="Agregá OPENAI_API_KEY para buscar también por significado">
      Búsqueda por palabras
    </span>
  );
}
