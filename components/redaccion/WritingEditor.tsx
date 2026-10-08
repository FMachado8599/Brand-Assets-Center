"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import {
  Bold,
  CaseLower,
  CaseSensitive,
  CaseUpper,
  Hash,
  Italic,
  List,
  ListOrdered,
  Redo2,
  RemoveFormatting,
  Repeat,
  Strikethrough,
  Type,
  Underline as UnderlineIcon,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/tooltip";
import { changeCase, cycleCase } from "@/lib/editor/changeCase";
import { charFor, imageUrl, variantId, type EmojiEntry, type Tone } from "@/lib/emojis/types";
import { around, findTrigger, RedaccionExtras, textSlice, type Trigger } from "@/lib/redaccion/editor";
import { docToPlain, docToUnicode, docToWhatsApp, hasFormatting, type DocNode } from "@/lib/redaccion/export";
import { fold } from "@/lib/redaccion/text";
import type { SlimEmoji } from "@/lib/redaccion/types";
import { cn } from "@/lib/utils";

export type WritingEditorHandle = {
  /** Inserta en el cursor (o reemplaza lo seleccionado). `spaced` separa con espacios de lo que haya alrededor. */
  insert: (text: string, opts?: { spaced?: boolean }) => void;
  focus: () => void;
  /** Lo mismo que Ctrl+E / Ctrl+H adentro del texto, para cuando el foco está en otro lado. */
  openList: (kind: Trigger["kind"]) => void;
  /** El texto en cada formato de exportación (ver lib/redaccion/export). */
  exports: () => { html: string; plain: string; whatsapp: string; unicode: string; formatted: boolean } | null;
};

export type HashtagOption = { tag: string; hint?: string };

type Props = {
  /** El HTML del texto. */
  value: string;
  /** HTML (lo que se guarda y muestra) y texto plano (para buscar, contar y pegar sin formato). */
  onChange: (html: string, text: string) => void;
  /** Cambia al abrir otra redacción: se carga de cero (sin el deshacer de la anterior) y el cursor va al final. */
  openKey: string;
  tone: Tone;
  /** Emojis para sugerir sin buscar: los del cliente y los recientes. */
  emojiPool: SlimEmoji[];
  /** Hashtags para sugerir: los del cliente (o de todos, si el texto no tiene) y los usados en otros textos. */
  hashtagPool: HashtagOption[];
  onEmojiUsed: (emoji: SlimEmoji | EmojiEntry) => void;
  placeholder?: string;
  className?: string;
};

type Item =
  | { kind: "emoji"; key: string; emoji: SlimEmoji | EmojiEntry; hint?: string }
  | { kind: "hashtag"; key: string; tag: string; hint?: string };

const MAX_ITEMS = 8;

/** Las búsquedas de emojis ya hechas, para no volver a pedirlas al borrar y reescribir. */
const searches = new Map<string, EmojiEntry[]>();

const matchesEmoji = (e: SlimEmoji | EmojiEntry, q: string) => fold(e.n).includes(q) || fold(e.e ?? "").includes(q);

/**
 * Editor pensado para escribir rápido:
 *  - formato con los atajos de siempre (Ctrl+B, Ctrl+I, Ctrl+U, Shift+F3…) o la barra de arriba,
 *  - ":" + dos letras sugiere emojis (":fue" → 🔥) y "#" sugiere hashtags del cliente y recientes,
 *  - Ctrl+E y Ctrl+H abren esas listas donde está el cursor,
 *  - ↑↓ elige, Enter o Tab inserta, Esc cierra.
 */
export const WritingEditor = forwardRef<WritingEditorHandle, Props>(function WritingEditor(
  { value, onChange, openKey, tone, emojiPool, hashtagPool, onEmojiUsed, placeholder, className },
  ref
) {
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  /** Posición del ":" o "#" que se cerró con Esc: no se vuelve a abrir hasta empezar otro. */
  const [dismissed, setDismissed] = useState<number | null>(null);
  /** El ":" o "#" lo puso un atajo: se muestra la lista aunque no se haya escrito nada, y Esc lo saca. */
  const forced = useRef<{ at: number; spaced: boolean } | null>(null);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<{ q: string; items: EmojiEntry[]; hybrid?: boolean }>({ q: "", items: [] });

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const keyRef = useRef<(e: KeyboardEvent) => boolean>(() => false);
  const openListRef = useRef<(char: ":" | "#") => void>(() => {});

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: "end",
    extensions: [
      // Negrita, cursiva, tachado y listas; sin títulos ni código (no tienen sentido en un posteo).
      StarterKit.configure({
        code: false,
        codeBlock: false,
        heading: false,
        blockquote: false,
        horizontalRule: false,
        hardBreak: false,
      }),
      Underline,
      RedaccionExtras,
      Placeholder.configure({ placeholder: placeholder ?? "Escribí acá…" }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "rd-editor outline-none",
        spellcheck: "true",
        "aria-label": "Texto de la redacción",
        "aria-multiline": "true",
      },
      handleKeyDown: (_view, event) => keyRef.current(event),
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML(), docToPlain(editor.getJSON() as DocNode)),
    onTransaction: ({ editor }) => setTrigger(editor.isFocused ? findTrigger(editor.state) : null),
    onFocus: ({ editor }) => setTrigger(findTrigger(editor.state)),
    onBlur: () => setTrigger(null),
  });

  // Otra redacción: contenido nuevo, historial de deshacer nuevo y el cursor al final.
  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(value, false);
    const { doc } = editor.state;
    editor.view.updateState(
      EditorState.create({ doc, plugins: editor.state.plugins, selection: TextSelection.atEnd(doc) })
    );
    // view.focus() es inmediato (commands.focus espera un frame): lo que se teclee enseguida ya entra al texto.
    editor.view.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, openKey]);

  // La misma redacción cambió desde afuera (otra pestaña u otra computadora).
  useEffect(() => {
    if (!editor || editor.getHTML() === value) return;
    const { from } = editor.state.selection;
    editor.commands.setContent(value, false);
    const size = editor.state.doc.content.size;
    editor.commands.setTextSelection(Math.min(from, size));
  }, [editor, value]);

  useImperativeHandle(
    ref,
    () => ({
      insert(text, { spaced } = {}) {
        if (!editor) return;
        const { state, view } = editor;
        const { from, to } = state.selection;
        let insert = text;
        if (spaced) {
          const { prev, next } = around(state, from, to);
          if (prev && !/\s/.test(prev)) insert = ` ${insert}`;
          if (!/\s/.test(next)) insert = `${insert} `;
        }
        const tr = insert.includes("\n")
          ? state.tr.replaceSelection(textSlice(state.schema, insert))
          : state.tr.insertText(insert, from, to);
        view.dispatch(tr.scrollIntoView());
      },
      focus: () => editor?.view.focus(),
      openList: (kind) => {
        if (!editor) return;
        editor.view.focus();
        openListRef.current(kind === "emoji" ? ":" : "#");
      },
      exports: () => {
        if (!editor) return null;
        const doc = editor.getJSON() as DocNode;
        return {
          html: editor.getHTML(),
          plain: docToPlain(doc),
          whatsapp: docToWhatsApp(doc),
          unicode: docToUnicode(doc),
          formatted: hasFormatting(doc),
        };
      },
    }),
    [editor]
  );

  /* ───────── sugerencias ───────── */

  const query = trigger ? fold(trigger.query) : "";
  const wantsList =
    !!trigger &&
    trigger.from !== dismissed &&
    (trigger.kind === "hashtag" || trigger.query.length >= 2 || forced.current?.at === trigger.from);

  /**
   * Emojis por nombre, en español o inglés y aunque haya errores de tipeo, en dos pasos:
   *  1. al toque, la búsqueda por palabras (tolera una o dos letras mal),
   *  2. apenas dejás de tipear un momento, la búsqueda por significado ("festejo" → 🎉),
   *     que reemplaza a la primera cuando llega.
   */
  const emojiQuery = wantsList && trigger?.kind === "emoji" && query.length >= 2 ? query : "";
  useEffect(() => {
    if (!emojiQuery) return;
    const ctrl = new AbortController();
    const timers: ReturnType<typeof setTimeout>[] = [];

    const run = (hybrid: boolean, delay: number) => {
      const key = `${hybrid ? "h" : "p"}:${emojiQuery}`;
      const show = (items: EmojiEntry[]) =>
        // La de palabras no pisa a la de significado si esa ya llegó para esta misma búsqueda.
        setRemote((prev) => (!hybrid && prev.q === emojiQuery && prev.hybrid ? prev : { q: emojiQuery, items, hybrid }));
      const cached = searches.get(key);
      if (cached) {
        show(cached);
        return;
      }
      timers.push(
        setTimeout(async () => {
          try {
            const url = `/api/emojis/search?q=${encodeURIComponent(emojiQuery)}&limit=${MAX_ITEMS}${hybrid ? "" : "&modo=palabras"}`;
            const body = (await (await fetch(url, { signal: ctrl.signal })).json()) as { emojis?: EmojiEntry[] };
            const items = body.emojis ?? [];
            searches.set(key, items);
            if (searches.size > 300) searches.delete(searches.keys().next().value!);
            show(items);
          } catch {
            /* cancelada o sin conexión: quedan las otras sugerencias */
          }
        }, delay)
      );
    };

    run(false, 60);
    if (emojiQuery.length >= 3) run(true, 280);
    return () => {
      timers.forEach(clearTimeout);
      ctrl.abort();
    };
  }, [emojiQuery]);

  const items = useMemo<Item[]>(() => {
    if (!wantsList || !trigger) return [];
    if (trigger.kind === "hashtag") {
      if (/[^\p{L}\p{N}_]/u.test(trigger.query)) return [];
      const starts: Item[] = [];
      const contains: Item[] = [];
      for (const option of hashtagPool) {
        const tag = fold(option.tag);
        const item: Item = { kind: "hashtag", key: option.tag.toLowerCase(), tag: option.tag, hint: option.hint };
        if (tag.startsWith(query)) starts.push(item);
        else if (query && tag.includes(query)) contains.push(item);
      }
      return [...starts, ...contains].slice(0, MAX_ITEMS);
    }

    const local = query ? emojiPool.filter((e) => matchesEmoji(e, query)) : emojiPool;
    // Mientras llega la búsqueda nueva, se muestra la anterior (filtrada si se puede): así la lista no parpadea al seguir escribiendo.
    let fetched: EmojiEntry[] = [];
    if (remote.q === query) fetched = remote.items;
    else if (remote.q && query.startsWith(remote.q)) {
      const narrowed = remote.items.filter((e) => matchesEmoji(e, query));
      fetched = narrowed.length ? narrowed : remote.items;
    }
    const seen = new Set<string>();
    const out: Item[] = [];
    for (const e of [...local.slice(0, query ? 3 : MAX_ITEMS), ...fetched]) {
      if (seen.has(e.i)) continue;
      seen.add(e.i);
      out.push({ kind: "emoji", key: e.i, emoji: e });
    }
    return out.slice(0, MAX_ITEMS);
  }, [wantsList, trigger, query, hashtagPool, emojiPool, remote]);

  const open = items.length > 0;
  const current = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => setActive(0), [trigger?.kind, trigger?.from, query]);
  useEffect(() => {
    if (!trigger) {
      setDismissed(null);
      forced.current = null;
    } else if (forced.current && forced.current.at !== trigger.from) {
      forced.current = null;
    }
  }, [trigger]);

  const pick = (item: Item) => {
    if (!editor || !trigger) return;
    const { state, view } = editor;
    let text: string;
    if (item.kind === "emoji") {
      text = charFor(item.emoji, tone);
      onEmojiUsed(item.emoji);
    } else {
      const { next } = around(state, trigger.to, trigger.to);
      text = `#${item.tag}${/\s/.test(next) ? "" : " "}`;
    }
    forced.current = null;
    view.dispatch(state.tr.insertText(text, trigger.from, trigger.to).scrollIntoView());
    view.focus();
  };

  /** Esc: se cierra la lista. Si la abrió un atajo y no se escribió nada, también se saca el ":" o "#". */
  const dismiss = () => {
    if (!editor || !trigger) return;
    const f = forced.current;
    if (f && f.at === trigger.from && !trigger.query) {
      const { state, view } = editor;
      view.dispatch(state.tr.delete(trigger.from - (f.spaced ? 1 : 0), trigger.to));
      forced.current = null;
      return;
    }
    setDismissed(trigger.from);
  };

  /** Ctrl+E / Ctrl+H: pone el ":" o "#" en el cursor y abre la lista ahí. */
  const openList = (char: ":" | "#") => {
    if (!editor) return;
    const { state, view } = editor;
    const { from, to } = state.selection;
    const { prev } = around(state, from, from);
    const spaced = !!prev && !/[\s([{¡¿"'“«]/.test(prev);
    const insert = `${spaced ? " " : ""}${char}`;
    forced.current = { at: from + insert.length - 1, spaced };
    view.dispatch(state.tr.insertText(insert, from, to).scrollIntoView());
  };
  openListRef.current = openList;

  keyRef.current = (e) => {
    if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      const key = e.key.toLowerCase();
      if (key === "e" || key === "h") {
        e.preventDefault();
        openList(key === "e" ? ":" : "#");
        return true;
      }
    }
    if (!trigger) return false;
    if (e.key === "Escape" && (open || forced.current)) {
      dismiss();
      return true;
    }
    if (!open) return false;
    switch (e.key) {
      case "ArrowDown":
        setActive((current + 1) % items.length);
        return true;
      case "ArrowUp":
        setActive((current - 1 + items.length) % items.length);
        return true;
      case "Tab":
        pick(items[current]);
        return true;
      case "Enter": {
        // "#Changan" ya escrito entero + Enter es un salto de línea, no "elegir #Changan".
        const item = items[current];
        if (item.kind === "hashtag" && fold(item.tag) === query) {
          setDismissed(trigger.from);
          return false;
        }
        pick(item);
        return true;
      }
    }
    return false;
  };

  return (
    <>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className={className} />
      {editor && open && trigger && (
        <SuggestList
          anchor={trigger.from}
          editor={editor}
          kind={trigger.kind}
          items={items}
          active={current}
          tone={tone}
          onHover={setActive}
          onPick={pick}
        />
      )}
    </>
  );
});

function SuggestList({
  anchor,
  editor,
  kind,
  items,
  active,
  tone,
  onHover,
  onPick,
}: {
  anchor: number;
  editor: Editor;
  kind: Trigger["kind"];
  items: Item[];
  active: number;
  tone: Tone;
  onHover: (index: number) => void;
  onPick: (item: Item) => void;
}) {
  const [box, setBox] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // Pegada al ":" o "#"; si abajo no entra, se abre hacia arriba. Sigue al texto si la página scrollea.
  useLayoutEffect(() => {
    const measure = () => {
      try {
        const c = editor.view.coordsAtPos(anchor);
        const left = Math.max(8, Math.min(c.left - 10, window.innerWidth - 280));
        setBox(window.innerHeight - c.bottom < 300 ? { left, bottom: window.innerHeight - c.top + 6 } : { left, top: c.bottom + 6 });
      } catch {
        setBox(null);
      }
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [editor, anchor]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!box) return null;

  return createPortal(
    <div
      ref={list}
      role="listbox"
      aria-label={kind === "emoji" ? "Emojis sugeridos" : "Hashtags sugeridos"}
      className="floating fixed z-[70] max-h-[min(23rem,50vh)] w-[17rem] overflow-y-auto rounded-2xl p-1.5 text-sm duration-150 animate-in fade-in-0 zoom-in-95"
      style={box}
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          role="option"
          data-index={index}
          aria-selected={index === active}
          // onMouseMove y no onMouseEnter: si la lista aparece debajo del mouse quieto, no cambia la elegida.
          onMouseMove={() => index !== active && onHover(index)}
          onClick={() => onPick(item)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors",
            index === active && "bg-secondary"
          )}
        >
          {item.kind === "emoji" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl(variantId(item.emoji, tone))} alt="" className="h-6 w-6 shrink-0" />
          ) : (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/25">
              <Hash className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate">{item.kind === "emoji" ? item.emoji.n : `#${item.tag}`}</span>
          {item.hint && <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{item.hint}</span>}
        </button>
      ))}
      <p className="hidden px-2 pb-0.5 pt-1.5 text-[10px] text-muted-foreground sm:block">
        <Kbd>↑↓</Kbd> elegir · <Kbd>Enter</Kbd> insertar · <Kbd>Esc</Kbd> cerrar
      </p>
    </div>,
    document.body
  );
}

/** Los botones no se quedan con el foco: el cursor sigue en el texto. */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

function ToolButton({
  icon: Icon,
  label,
  shortcut,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Hint label={shortcut ? `${label} · ${shortcut}` : label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onMouseDown={keepFocus}
        onClick={onClick}
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-35",
          active && "bg-foreground text-background hover:bg-foreground/90 hover:text-background"
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
    </Hint>
  );
}

const Sep = () => <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;

/** La barra de formato, pegada arriba del texto mientras se scrollea. */
function Toolbar({ editor }: { editor: Editor | null }) {
  const off = !editor;
  const is = (name: string) => !!editor?.isActive(name);
  const run = (fn: (e: Editor) => void) => () => editor && fn(editor);

  return (
    <div
      role="toolbar"
      aria-label="Formato"
      className="no-scrollbar sticky top-[4.6rem] z-10 flex items-center gap-0.5 overflow-x-auto border-b border-black/[0.05] bg-card/95 px-2 py-1.5 backdrop-blur sm:px-3"
    >
      <ToolButton icon={Bold} label="Negrita" shortcut="Ctrl B" active={is("bold")} disabled={off} onClick={run((e) => e.chain().focus().toggleBold().run())} />
      <ToolButton icon={Italic} label="Cursiva" shortcut="Ctrl I" active={is("italic")} disabled={off} onClick={run((e) => e.chain().focus().toggleItalic().run())} />
      <ToolButton
        icon={UnderlineIcon}
        label="Subrayado"
        shortcut="Ctrl U"
        active={is("underline")}
        disabled={off}
        onClick={run((e) => e.chain().focus().toggleUnderline().run())}
      />
      <ToolButton
        icon={Strikethrough}
        label="Tachado"
        shortcut="Ctrl Shift S"
        active={is("strike")}
        disabled={off}
        onClick={run((e) => e.chain().focus().toggleStrike().run())}
      />
      <Sep />
      <DropdownMenu>
        <Hint label="Mayúsculas y minúsculas · Shift F3">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Mayúsculas y minúsculas"
              disabled={off}
              onMouseDown={keepFocus}
              className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-35 data-[state=open]:bg-secondary"
            >
              <CaseSensitive className="h-[18px] w-[18px]" />
            </button>
          </DropdownMenuTrigger>
        </Hint>
        {/* Al cerrar, el foco vuelve al texto (no al botón): el cambio se ve aplicado y se sigue escribiendo. */}
        <DropdownMenuContent align="start" onCloseAutoFocus={(ev) => ev.preventDefault()}>
          <DropdownMenuItem onSelect={run((e) => changeCase(e, "upper", "word"))}>
            <CaseUpper /> MAYÚSCULAS
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={run((e) => changeCase(e, "lower", "word"))}>
            <CaseLower /> minúsculas
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={run((e) => changeCase(e, "title", "word"))}>
            <Type /> Capitalizar Cada Palabra
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={run((e) => cycleCase(e))}>
            <Repeat /> Ir alternando
            <span className="ml-auto pl-4 text-[11px] text-muted-foreground">Shift F3</span>
          </DropdownMenuItem>
          <p className="max-w-[15rem] px-2 pb-1.5 pt-1 text-[11px] leading-snug text-muted-foreground">
            Se aplica a lo seleccionado o, si no hay nada, a la palabra del cursor.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolButton
        icon={List}
        label="Lista con viñetas"
        shortcut="Ctrl Shift 8"
        active={is("bulletList")}
        disabled={off}
        onClick={run((e) => e.chain().focus().toggleBulletList().run())}
      />
      <ToolButton
        icon={ListOrdered}
        label="Lista numerada"
        shortcut="Ctrl Shift 7"
        active={is("orderedList")}
        disabled={off}
        onClick={run((e) => e.chain().focus().toggleOrderedList().run())}
      />
      <ToolButton
        icon={RemoveFormatting}
        label="Quitar formato"
        shortcut={"Ctrl \\"}
        disabled={off}
        onClick={run((e) => e.chain().focus().unsetAllMarks().clearNodes().run())}
      />
      <span className="ml-auto flex items-center gap-0.5 pl-2">
        <ToolButton icon={Undo2} label="Deshacer" shortcut="Ctrl Z" disabled={off || !editor.can().undo()} onClick={run((e) => e.chain().focus().undo().run())} />
        <ToolButton icon={Redo2} label="Rehacer" shortcut="Ctrl Y" disabled={off || !editor.can().redo()} onClick={run((e) => e.chain().focus().redo().run())} />
      </span>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-card px-1 font-ui text-[10px] font-medium">{children}</kbd>;
}
