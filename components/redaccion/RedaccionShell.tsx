"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Check,
  ClipboardCopy,
  Copy,
  CopyPlus,
  Download,
  Hash,
  History,
  Keyboard,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RemoveFormatting,
  Share2,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { BarAction, BarButton, BarDivider, BarPopover, ContextBar, PanelTitle } from "@/components/shell/ContextBar";
import { useConfirm } from "@/components/ui/confirm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toaster";
import { useBrandKits, useBrands } from "@/hooks/useBrandKits";
import { useRedacciones } from "@/hooks/useRedacciones";
import { slim, useSharedEmojis } from "@/hooks/useSharedEmojis";
import { copyPlain, copyRich } from "@/lib/cards/clipboard";
import { charFor, type CategorySummary, type EmojiEntry } from "@/lib/emojis/types";
import {
  DEFAULT_TITLE,
  downloadText,
  extractHashtags,
  MAX_HASHTAGS,
  onlyHashtags,
  textStats,
  withoutHashtags,
} from "@/lib/redaccion/text";
import type { Redaccion, SlimEmoji } from "@/lib/redaccion/types";
import { cn } from "@/lib/utils";
import { Bubble, ClientPicker, PANELS, SyncBadge, TitleInput, type PanelKind } from "./EditorParts";
import { EmojiPanel } from "./EmojiPanel";
import { HashtagPanel } from "./HashtagPanel";
import { RecentList } from "./RecentList";
import { Kbd, WritingEditor, type HashtagOption, type WritingEditorHandle } from "./WritingEditor";

/** Preferencias de esta computadora (no viajan a la cuenta): qué redacción estaba abierta, qué panel y el último cliente. */
const CURRENT_KEY = "redaccion:abierta";
const PANEL_KEY = "redaccion:panel";
const CLIENT_KEY = "redaccion:ultimo-cliente";

function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Formas de copiar:
 *  - all: con formato (lo que lo entiende, como Docs o un mail, lo recibe con negritas) y plano para el resto,
 *  - plain: sin formato, whatsapp: *negrita* y _cursiva_, unicode: 𝗻𝗲𝗴𝗿𝗶𝘁𝗮 para Instagram o LinkedIn,
 *  - sin-hashtags y hashtags: para cuando los hashtags van en el primer comentario.
 */
type CopyKind = "all" | "plain" | "whatsapp" | "unicode" | "sin-hashtags" | "hashtags";

const COPIED: Record<CopyKind, string> = {
  all: "Texto copiado",
  plain: "Copiado sin formato",
  whatsapp: "Copiado para WhatsApp",
  unicode: "Copiado con negritas para redes",
  "sin-hashtags": "Copiado sin hashtags",
  hashtags: "Hashtags copiados",
};

/**
 * Redacción: un lugar para escribir rápido y sacar el texto más rápido
 * todavía. Texto con formato, los emojis y hashtags de cada cliente a un
 * click (o a un ":" / "#" de distancia), redacciones recientes y por cliente
 * a la izquierda, y todo guardado solo (en el navegador y, con sesión, en la
 * cuenta).
 */
export function RedaccionShell({ categories }: { categories: CategorySummary[] }) {
  const store = useRedacciones();
  const { brands, loading: brandsLoading } = useBrands();
  const kits = useBrandKits();
  const emojis = useSharedEmojis();
  const confirm = useConfirm();
  const editor = useRef<WritingEditorHandle>(null);

  const [restored, setRestored] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [draftBrand, setDraftBrand] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState(0);
  const [panel, setPanel] = useState<PanelKind | null>(null);
  /** El panel lo abrió la persona recién (no quedó abierto de antes): el foco va a su buscador. */
  const [panelFocus, setPanelFocus] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  /** La que se creó al empezar a escribir una nueva: los cambios siguientes van a ella aunque todavía no se haya vuelto a pintar. */
  const created = useRef<string | null>(null);

  // Lo de esta computadora se lee después de montar (no rompe la hidratación).
  useEffect(() => {
    setCurrentId(readLocal(CURRENT_KEY));
    setDraftBrand(readLocal(CLIENT_KEY));
    // El panel que quedó abierto se vuelve a abrir solo en pantallas anchas: en el celular taparía el texto.
    const savedPanel = readLocal(PANEL_KEY);
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    if (wide && (savedPanel === "emojis" || savedPanel === "hashtags")) setPanel(savedPanel);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) writeLocal(CURRENT_KEY, currentId);
  }, [restored, currentId]);
  useEffect(() => {
    if (restored) writeLocal(PANEL_KEY, panel);
  }, [restored, panel]);

  const current = useMemo(() => store.items.find((r) => r.id === currentId) ?? null, [store.items, currentId]);
  const text = current?.body ?? "";
  const brandId = current ? current.brandId : draftBrand;
  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name ?? null;

  /**
   * El cliente que muestran los paneles. Sigue al del texto, pero se puede
   * cambiar para ver o cargar los emojis y hashtags de otro sin tocar el texto.
   */
  const [panelClient, setPanelClient] = useState<string | null>(null);
  useEffect(() => setPanelClient(brandId), [brandId, currentId]);
  const panelBrand = brands.find((b) => b.id === panelClient) ?? null;
  const panelKit = kits.kitOf(panelClient);
  /** Dónde quedan los emojis y hashtags guardados desde el panel. */
  const kitWhere = panelBrand ? `en ${panelBrand.name}` : "para textos sin cliente";

  /* ───────── redacciones ───────── */

  const handleChange = useCallback(
    (html: string, plain: string) => {
      const id = current?.id ?? created.current;
      if (id) {
        store.update(id, { html, body: plain });
        return;
      }
      // Recién al escribir algo se crea: "Nueva" no deja redacciones vacías en la lista.
      if (!plain.trim()) return;
      const item = store.create({ html, body: plain, brandId: draftBrand });
      created.current = item.id;
      setCurrentId(item.id);
    },
    [current, store, draftBrand]
  );

  /** Abre otra redacción (o una nueva, con null) en el editor, de cero. */
  const show = useCallback((id: string | null) => {
    created.current = null;
    setCurrentId(id);
    setOpenKey((k) => k + 1);
  }, []);

  /** Una redacción que quedó vacía no vale la pena guardarla. */
  const dropIfEmpty = useCallback(
    (item: Redaccion | null) => {
      if (item && !item.body.trim() && !item.titleEdited) store.remove(item.id);
    },
    [store]
  );

  const open = useCallback(
    (id: string) => {
      if (id !== currentId) {
        dropIfEmpty(current);
        show(id);
      }
      setListsOpen(false);
    },
    [currentId, current, dropIfEmpty, show]
  );

  /** Una nueva para ese cliente (desde la pestaña Clientes) o, sin argumento, con el cliente de la que estabas. */
  const startNew = useCallback(
    (client?: string | null) => {
      dropIfEmpty(current);
      // Por defecto sigue con el cliente de la que estabas: se suelen escribir varias seguidas para el mismo.
      setDraftBrand(client === undefined ? brandId : client);
      show(null);
      setListsOpen(false);
    },
    [current, brandId, dropIfEmpty, show]
  );

  const setBrand = (id: string | null) => {
    writeLocal(CLIENT_KEY, id);
    if (current) store.update(current.id, { brandId: id });
    else setDraftBrand(id);
  };

  const rename = (title: string) => {
    const id = current?.id ?? created.current;
    if (id) store.update(id, { title });
    else if (title.trim()) {
      const item = store.create({ title, brandId: draftBrand });
      created.current = item.id;
      setCurrentId(item.id);
    }
  };

  const remove = async (item: Redaccion) => {
    const ok = await confirm({
      title: `¿Borrar “${item.title}”?`,
      description:
        store.sync === "local"
          ? "Se borra de este navegador. No se puede deshacer."
          : "Se borra de este navegador y de tu cuenta. No se puede deshacer.",
      confirmLabel: "Borrar",
      destructive: true,
    });
    if (!ok) return;
    store.remove(item.id);
    if (item.id === currentId) {
      setDraftBrand(item.brandId);
      show(null);
    }
    toast("Redacción borrada");
  };

  const duplicate = () => {
    if (!current) return;
    show(
      store.create({ body: current.body, html: current.html, brandId: current.brandId, title: `${current.title} (copia)` }).id
    );
    toast("Duplicada: estás en la copia");
  };

  /* ───────── exportar ───────── */

  const copy = useCallback(
    async (kind: CopyKind = "all") => {
      setExportOpen(false);
      // El texto tal como está en el editor (o lo guardado, si el editor todavía no cargó).
      const out = editor.current?.exports() ?? { html: current?.html ?? "", plain: text, whatsapp: text, unicode: text };
      const plain = out.plain.trim();
      const value =
        kind === "hashtags"
          ? onlyHashtags(plain)
          : kind === "sin-hashtags"
          ? withoutHashtags(plain)
          : kind === "whatsapp"
          ? out.whatsapp.trim()
          : kind === "unicode"
          ? out.unicode.trim()
          : plain;
      if (!value) {
        toast(kind === "hashtags" ? "El texto no tiene hashtags" : "Todavía no hay nada para copiar", "error");
        return;
      }
      const ok = kind === "all" ? await copyRich(out.html, value) : await copyPlain(value);
      if (!ok) {
        toast("No se pudo copiar", "error");
        return;
      }
      toast(`${COPIED[kind]} · ${textStats(value).chars} caracteres`);
      if (kind === "all") {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    },
    [current, text]
  );

  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  const download = () => {
    setExportOpen(false);
    if (!text.trim()) toast("Todavía no hay nada para descargar", "error");
    else downloadText(text.trim(), current?.title ?? DEFAULT_TITLE);
  };

  const share = async () => {
    setExportOpen(false);
    try {
      await navigator.share({ text: text.trim() });
    } catch {
      /* cancelado */
    }
  };

  // Ctrl+Enter copia todo; Ctrl+S avisa que no hace falta (se guarda solo).
  // Ctrl+E / Ctrl+H desde fuera del texto (el nombre, un panel) vuelven al texto y abren la lista.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      // Adentro del texto, Ctrl+E / Ctrl+H ya los atendió el editor (y el editor marca todo Enter como atendido).
      if (e.ctrlKey && !e.metaKey && !e.shiftKey && (key === "e" || key === "h")) {
        if (e.defaultPrevented) return;
        e.preventDefault();
        editor.current?.openList(key === "e" ? "emoji" : "hashtag");
      } else if (e.key === "Enter") {
        e.preventDefault();
        copy("all");
      } else if (key === "s" && !e.shiftKey) {
        e.preventDefault();
        toast("No hace falta: se guarda solo mientras escribís");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copy]);

  /* ───────── emojis y hashtags ───────── */

  const insertEmoji = useCallback(
    (emoji: SlimEmoji | EmojiEntry) => {
      editor.current?.insert(charFor(emoji, emojis.tone));
      emojis.remember(emoji);
    },
    [emojis]
  );

  const togglePin = useCallback(
    (emoji: SlimEmoji | EmojiEntry) => {
      const pinned = panelKit.emojis.some((e) => e.i === emoji.i);
      kits.toggleEmoji(panelClient, slim(emoji));
      toast(pinned ? `${emoji.c} ya no está fijado ${kitWhere}` : `${emoji.c} fijado ${kitWhere}`);
    },
    [panelKit.emojis, kits, panelClient, kitWhere]
  );

  const inText = useMemo(() => extractHashtags(text), [text]);

  /** Hashtags de tus otras redacciones, de la más nueva a la más vieja. */
  const recentTags = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of store.items) {
      if (r.id === currentId) continue;
      for (const tag of extractHashtags(r.body)) {
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
        if (out.length >= 80) return out;
      }
    }
    return out;
  }, [store.items, currentId]);

  /**
   * Lo que sugiere "#" en el texto: los hashtags del cliente del texto o, si
   * el texto no tiene cliente, los de todos (con el nombre de cada uno), y
   * después los recientes.
   */
  const hashtagPool = useMemo<HashtagOption[]>(() => {
    const seen = new Set<string>();
    const out: HashtagOption[] = [];
    const add = (tags: string[], hint: string) => {
      for (const tag of tags) {
        if (seen.has(tag.toLowerCase())) continue;
        seen.add(tag.toLowerCase());
        out.push({ tag, hint });
      }
    };
    if (brandId) add(kits.kitOf(brandId).hashtags, brandName(brandId) ?? "cliente");
    else {
      add(kits.kitOf(null).hashtags, "guardado");
      for (const b of brands) add(kits.kitOf(b.id).hashtags, b.name);
    }
    add(recentTags, "reciente");
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kits.kitOf, brandId, brands, recentTags]);

  /** Lo que sugiere ":" sin escribir nada: los emojis fijados del cliente del texto y los recientes. */
  const emojiPool = useMemo(() => {
    const pinned = kits.kitOf(brandId).emojis;
    const ids = new Set(pinned.map((e) => e.i));
    return [...pinned, ...emojis.recents.filter((e) => !ids.has(e.i))];
  }, [kits, brandId, emojis.recents]);

  const insertHashtags = (tags: string[]) => {
    const missing = tags.filter((t) => !inText.some((x) => x.toLowerCase() === t.toLowerCase()));
    const list = tags.length === 1 ? tags : missing;
    if (!list.length) {
      toast("Ya están todos en el texto");
      return;
    }
    editor.current?.insert(list.map((t) => `#${t}`).join(" "), { spaced: true });
  };

  const saveHashtags = (tags: string[]) => {
    kits.addHashtags(panelClient, tags);
    toast(tags.length === 1 ? `#${tags[0]} guardado ${kitWhere}` : `${tags.length} hashtags guardados ${kitWhere}`);
  };

  const togglePanel = (kind: PanelKind) => {
    setPanelFocus(panel !== kind);
    setPanel((prev) => (prev === kind ? null : kind));
  };

  const stats = useMemo(() => textStats(text), [text]);
  const ready = restored && store.loaded;

  const panelBody =
    panel === "emojis" ? (
      <EmojiPanel
        key={`emojis-${panelClient ?? ""}`}
        categories={categories}
        tone={emojis.tone}
        onToneChange={emojis.setTone}
        brandName={panelBrand?.name ?? null}
        brandEmojis={panelKit.emojis}
        recents={emojis.recents}
        favorites={emojis.favorites}
        onInsert={insertEmoji}
        onTogglePin={togglePin}
        autoFocus={panelFocus}
      />
    ) : panel === "hashtags" ? (
      <HashtagPanel
        brandName={panelBrand?.name ?? null}
        saved={panelKit.hashtags}
        inText={inText}
        recent={recentTags}
        onInsert={insertHashtags}
        onSave={saveHashtags}
        onForget={(tag) => kits.removeHashtag(panelClient, tag)}
        autoFocus={panelFocus}
      />
    ) : null;

  const lists = (
    <RecentList
      items={store.items}
      brands={brands}
      currentId={currentId}
      onOpen={open}
      onDelete={remove}
      onNewFor={(client) => startNew(client)}
    />
  );

  return (
    <>
      <ContextBar>
        <span className="flex xl:hidden">
          <BarPopover
            label="Redacciones"
            icon={History}
            className="flex h-[min(34rem,72vh)] w-80 flex-col"
            open={listsOpen}
            onOpenChange={setListsOpen}
          >
            {lists}
          </BarPopover>
        </span>
        <BarButton label="Nueva redacción" icon={Plus} onClick={() => startNew()} />
        <BarDivider />
        <span className="hidden sm:flex">
          <BarPopover label="Atajos" icon={Keyboard} className="w-80">
            <Shortcuts />
          </BarPopover>
        </span>
        <BarPopover label="Exportar" icon={Share2} className="w-72 p-1.5" open={exportOpen} onOpenChange={setExportOpen}>
          <ExportItem icon={ClipboardCopy} label="Copiar todo" hint="Ctrl Enter" onClick={() => copy("all")} />
          <ExportItem icon={RemoveFormatting} label="Copiar sin formato" onClick={() => copy("plain")} />
          <ExportItem icon={MessageCircle} label="Copiar para WhatsApp" hint="*negrita*" onClick={() => copy("whatsapp")} />
          <ExportItem icon={Bold} label="Copiar para Instagram / LinkedIn" hint="𝗻𝗲𝗴𝗿𝗶𝘁𝗮" onClick={() => copy("unicode")} />
          <div className="my-1 h-px bg-border" />
          <ExportItem icon={Copy} label="Copiar sin hashtags" hint="1er comentario" onClick={() => copy("sin-hashtags")} />
          <ExportItem icon={Hash} label="Copiar solo los hashtags" onClick={() => copy("hashtags")} />
          <div className="my-1 h-px bg-border" />
          <ExportItem icon={Download} label="Descargar .txt" onClick={download} />
          {canShare && <ExportItem icon={Share2} label="Compartir…" hint="WhatsApp, mail…" onClick={share} />}
        </BarPopover>
        <BarAction label={copied ? "Copiado" : "Copiar texto"} icon={copied ? Check : ClipboardCopy} onClick={() => copy("all")}>
          {copied ? "Copiado" : "Copiar"}
        </BarAction>
      </ContextBar>

      <main className="mx-auto max-w-[1480px] px-3 pb-6 pt-[5.25rem] sm:px-6 sm:pt-[5.5rem]">
        <h1 className="sr-only">Redacción</h1>
        <div className="flex items-start gap-5">
          <aside className="sticky top-[5.5rem] hidden h-[calc(100vh-6.5rem)] w-64 shrink-0 xl:flex xl:flex-col">{lists}</aside>

          <div className="flex min-w-0 flex-1 items-start justify-center gap-3">
            <section
              aria-label="Editor"
              className="flex min-w-0 max-w-3xl flex-1 flex-col rounded-[1.75rem] border border-black/[0.06] bg-card/95 shadow-[0_1px_2px_hsl(40_30%_20%/0.04),0_18px_40px_-24px_hsl(40_45%_20%/0.3)]"
            >
              <header className="flex items-center gap-2 rounded-t-[1.75rem] border-b border-black/[0.05] px-3 py-2.5 sm:px-4">
                <TitleInput
                  key={current?.id ?? "nueva"}
                  title={current?.title ?? DEFAULT_TITLE}
                  edited={current?.titleEdited ?? false}
                  onRename={rename}
                  onDone={() => editor.current?.focus()}
                />
                <ClientPicker brands={brands} value={brandId} onChange={setBrand} loading={brandsLoading} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Más opciones"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary"
                    >
                      <MoreHorizontal className="h-[18px] w-[18px]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => startNew()}>
                      <Plus /> Nueva redacción
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={duplicate} disabled={!current}>
                      <CopyPlus /> Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => current && remove(current)}
                      disabled={!current}
                      className="text-destructive data-[highlighted]:bg-destructive/10"
                    >
                      <Trash2 /> Borrar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </header>

              {ready ? (
                <WritingEditor
                  ref={editor}
                  value={current?.html ?? ""}
                  onChange={handleChange}
                  openKey={String(openKey)}
                  tone={emojis.tone}
                  emojiPool={emojiPool}
                  hashtagPool={hashtagPool}
                  onEmojiUsed={emojis.remember}
                  placeholder="Escribí acá…  ( : + nombre para emojis · # para hashtags )"
                  className="flex-1"
                />
              ) : (
                <div className="rd-editor flex-1" aria-hidden>
                  <span className="skeleton block h-4 w-2/3 rounded-full" />
                </div>
              )}

              <footer className="sticky bottom-0 flex items-center gap-3 rounded-b-[1.75rem] border-t border-black/[0.05] bg-card/90 px-3 py-2 backdrop-blur sm:px-4">
                <div className="flex items-center gap-0.5 lg:hidden">
                  {PANELS.map((p) => (
                    <Bubble key={p.kind} kind={p.kind} size="sm" open={panel === p.kind} onClick={() => togglePanel(p.kind)} />
                  ))}
                </div>
                <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                  <span>
                    <strong className="font-semibold text-foreground/80">{stats.chars.toLocaleString("es")}</strong> caracteres
                  </span>
                  <span>{stats.words.toLocaleString("es")} palabras</span>
                  {stats.hashtags > 0 && (
                    <span className={cn(stats.hashtags > MAX_HASHTAGS && "font-medium text-destructive")}>
                      {stats.hashtags} {stats.hashtags === 1 ? "hashtag" : "hashtags"}
                      {stats.hashtags > MAX_HASHTAGS && ` (Instagram: máx. ${MAX_HASHTAGS})`}
                    </span>
                  )}
                </p>
                <SyncBadge state={store.sync} />
              </footer>
            </section>

            <div className="sticky top-[5.5rem] hidden flex-col gap-2 pt-1 lg:flex" aria-label="Paneles">
              {PANELS.map((p) => (
                <Bubble key={p.kind} kind={p.kind} open={panel === p.kind} onClick={() => togglePanel(p.kind)} />
              ))}
            </div>
          </div>

          {panel && (
            <aside
              aria-label={panel === "emojis" ? "Emojis" : "Hashtags"}
              className="floating fixed inset-x-2 bottom-2 z-30 flex h-[min(28rem,55vh)] flex-col rounded-[1.75rem] pt-3 duration-300 animate-in fade-in-0 slide-in-from-bottom-4 lg:sticky lg:inset-auto lg:top-[5.5rem] lg:z-auto lg:h-[calc(100vh-6.5rem)] lg:w-80 lg:shrink-0 lg:slide-in-from-bottom-0 lg:slide-in-from-right-4"
            >
              <div className="flex items-center gap-2 px-3 pb-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary">
                  <PanelIcon kind={panel} />
                </span>
                <h2 className="text-sm font-semibold">{panel === "emojis" ? "Emojis" : "Hashtags"}</h2>
                <ClientPicker
                  size="sm"
                  title="Ver los de"
                  brands={brands}
                  value={panelClient}
                  onChange={setPanelClient}
                  loading={brandsLoading}
                  textClient={brandId}
                />
                <button
                  type="button"
                  aria-label="Cerrar panel"
                  onClick={() => setPanel(null)}
                  className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {panelClient !== brandId && (
                <p className="mx-3 mb-2 rounded-xl bg-primary/15 px-2.5 py-1.5 text-[11px] leading-snug text-foreground/80">
                  Estás viendo los de {panelBrand?.name ?? "textos sin cliente"}. Este texto es de{" "}
                  {brandName(brandId) ?? "ningún cliente"}.{" "}
                  <button type="button" onClick={() => setPanelClient(brandId)} className="font-semibold underline underline-offset-2">
                    Volver
                  </button>
                </p>
              )}
              {panelBody}
            </aside>
          )}
        </div>
      </main>
    </>
  );
}

function PanelIcon({ kind }: { kind: PanelKind }) {
  const Icon = PANELS.find((p) => p.kind === kind)!.icon;
  return <Icon className="h-3.5 w-3.5" strokeWidth={kind === "hashtags" ? 2.6 : 2.2} />;
}

function ExportItem({ icon: Icon, label, hint, onClick }: { icon: LucideIcon; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-secondary"
    >
      <Icon className="h-4 w-4 shrink-0 text-foreground/70" />
      <span className="flex-1">{label}</span>
      {hint && <span className="shrink-0 text-[11px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

const SHORTCUTS: { title: string; items: [string, string][] }[] = [
  {
    title: "Formato",
    items: [
      ["Ctrl B", "Negrita"],
      ["Ctrl I", "Cursiva"],
      ["Ctrl U", "Subrayado"],
      ["Ctrl Shift S", "Tachado"],
      ["Shift F3", "minúsculas → MAYÚSCULAS → Capitalizar"],
      ["Ctrl Shift 8", "Lista con viñetas"],
      ["Ctrl \\", "Quitar formato"],
    ],
  },
  {
    title: "Emojis y hashtags",
    items: [
      [":fuego", "Emojis por nombre, mientras escribís"],
      ["#", "Hashtags del cliente y recientes"],
      ["Ctrl E", "Lista de emojis en el cursor"],
      ["Ctrl H", "Lista de hashtags en el cursor"],
      ["Enter · Tab", "Insertar la sugerencia"],
    ],
  },
  { title: "Exportar", items: [["Ctrl Enter", "Copiar todo el texto"]] },
];

function Shortcuts() {
  return (
    <div>
      <PanelTitle title="Atajos" hint="Para no sacar las manos del teclado." />
      <div className="space-y-3">
        {SHORTCUTS.map((group) => (
          <section key={group.title}>
            <p className="eyebrow mb-1.5">{group.title}</p>
            <dl className="space-y-1.5 text-sm">
              {group.items.map(([keys, what]) => (
                <div key={keys} className="flex items-center justify-between gap-3">
                  <dt className="flex shrink-0 gap-1">
                    {keys.split(" · ").map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dt>
                  <dd className="text-right text-xs text-muted-foreground">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
