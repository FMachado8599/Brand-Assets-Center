"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import {
  Bold,
  CaseLower,
  CaseSensitive,
  CaseUpper,
  Hash,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Redo2,
  RemoveFormatting,
  Repeat,
  Sparkles,
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
import { toast } from "@/components/ui/toaster";
import { Hint } from "@/components/ui/tooltip";
import { changeCase, cycleCase } from "@/lib/editor/changeCase";
import { charFor, imageUrl, variantId, type EmojiEntry, type Tone } from "@/lib/emojis/types";
import { around, findTrigger, RedaccionExtras, textSlice, type Trigger } from "@/lib/redaccion/editor";
import { docToPlain, docToUnicode, docToWhatsApp, hasFormatting, type DocNode } from "@/lib/redaccion/export";
import type { PedidoPalabras, RespuestaPalabras } from "@/lib/redaccion/ia.client";
import { OCULTAR, Prediccion, prediccionKey } from "@/lib/redaccion/prediccion-ext";
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
  /** Texto predictivo mientras se escribe: lo que sigue después de `antes` (la línea hasta el cursor), o null. */
  predecir?: (antes: string) => string | null;
  /** Palabras que la IA sugiere para el cursor (hasta tres). Si falla, tira un Error con el motivo. */
  sugerirPalabras?: (pedido: PedidoPalabras, signal: AbortSignal) => Promise<RespuestaPalabras>;
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

/* ───────── palabras sugeridas por la IA ───────── */

/**
 * Las que se muestran: `base` es el texto antes de la palabra que se está escribiendo y `prefijo` sus letras
 * (puede ser ""). En modo "completar" terminan esa palabra; en "seguir" la palabra ya está escrita y son
 * las que pueden venir después (se insertan con un espacio delante).
 */
type Opciones = { base: string; prefijo: string; lista: string[]; modo: RespuestaPalabras["modo"] };

/** Cuánto se espera sin tipear antes de pedirle palabras a la IA. */
const ESPERA_IA = 500;
const CLAVE_IA = "redaccion-ia-sugerencias";
const AVISO_IA_MS = 30_000;

/** Si el servidor dijo que la IA no está configurada, no se insiste solo (sí si se pide a mano). */
let iaSinClave = false;

/**
 * Dónde está el cursor para sugerir palabras: al final de una línea o antes de un espacio, sin
 * selección ni lista de emojis/hashtags abierta, y con algo escrito antes. `null` si no corresponde.
 */
function contextoIA(state: EditorState, minPalabras = 1) {
  const { selection, doc } = state;
  if (!selection.empty || !selection.$from.parent.isTextblock) return null;
  const pos = selection.from;
  const { next } = around(state, pos, pos);
  if (next && !/\s/.test(next)) return null;
  if (findTrigger(state)) return null;
  const antes = doc.textBetween(0, pos, "\n", "\n");
  const prefijo = /[\p{L}\p{N}'’_-]*$/u.exec(antes)![0];
  const base = antes.slice(0, antes.length - prefijo.length);
  if (/[#@]$/.test(base)) return null;
  // Entre palabras (después de un espacio) o a mitad de una: pegada a un signo no.
  if (!prefijo && !/\s$/.test(base)) return null;
  if ((antes.match(/[\p{L}\p{N}]+/gu) ?? []).length < minPalabras) return null;
  return { pos, antes, base, prefijo, despues: doc.textBetween(pos, doc.content.size, "\n", "\n").slice(0, 200) };
}

type ContextoIA = NonNullable<ReturnType<typeof contextoIA>>;

/** De las palabras de la IA, las que completan lo que se lleva escrito de la actual. */
function filtrar(lista: string[], prefijo: string) {
  const p = fold(prefijo);
  if (!p) return lista;
  return lista.filter((o) => {
    const k = fold(o);
    return k.startsWith(p) && k !== p;
  });
}

/**
 * Editor pensado para escribir rápido:
 *  - formato con los atajos de siempre (Ctrl+B, Ctrl+I, Ctrl+U, Shift+F3…) o la barra de arriba,
 *  - ":" + dos letras sugiere emojis (":fue" → 🔥) y "#" sugiere hashtags del cliente y recientes,
 *  - Ctrl+E y Ctrl+H abren esas listas donde está el cursor,
 *  - ↑↓ elige, Enter o Tab inserta, Esc cierra,
 *  - mientras se escribe, una sugerencia gris con lo que probablemente sigue (Tab o → la acepta, Esc la saca):
 *    sale del vocabulario del cliente, sin IA, al instante,
 *  - al pausar, la IA propone hasta tres palabras que encajan en el cursor, en burbujas abajo a la izquierda:
 *    Alt+1/2/3 o un clic la inserta; si la palabra ya está terminada, proponen lo que sigue (sin apretar espacio).
 *    Ctrl+Espacio las pide ya; el botón ✨ de la barra apaga o enciende tanto esto como el texto gris.
 */
export const WritingEditor = forwardRef<WritingEditorHandle, Props>(function WritingEditor(
  { value, onChange, openKey, tone, emojiPool, hashtagPool, onEmojiUsed, predecir, sugerirPalabras, placeholder, className },
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
  const predecirRef = useRef(predecir);
  predecirRef.current = predecir;
  const sugerirRef = useRef(sugerirPalabras);
  sugerirRef.current = sugerirPalabras;
  const keyRef = useRef<(e: KeyboardEvent) => boolean>(() => false);
  const openListRef = useRef<(char: ":" | "#") => void>(() => {});

  /** Las palabras de la IA que se están mostrando (abajo a la izquierda). */
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const opcionesRef = useRef<Opciones | null>(null);
  opcionesRef.current = opciones;
  /** Esperando la respuesta de la IA. */
  const [cargando, setCargando] = useState(false);
  /** El botón ✨ de la barra: si se sugiere solo al escribir, el texto gris y las palabras de la IA (se recuerda en este navegador). */
  const [iaActiva, setIaActiva] = useState(true);
  const activaRef = useRef(false);
  activaRef.current = iaActiva && !!sugerirPalabras;
  /** El texto gris también se apaga con el ✨ (si el editor no tiene IA, no hay botón y queda siempre). */
  const grisActivoRef = useRef(true);
  grisActivoRef.current = iaActiva || !sugerirPalabras;
  /** El pedido a la IA en curso, y la espera antes de hacerlo: cualquier cambio en el texto los cancela. */
  const iaRef = useRef<AbortController | null>(null);
  const timerIA = useRef<ReturnType<typeof setTimeout>>();
  const ultimoAviso = useRef(0);
  const actualizarIARef = useRef<(editor: Editor, tr: Transaction) => void>(() => {});

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
      Prediccion.configure({ predecir: (antes) => (grisActivoRef.current ? predecirRef.current?.(antes) ?? null : null) }),
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
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.getHTML(), docToPlain(editor.getJSON() as DocNode));
    },
    onTransaction: ({ editor, transaction }) => {
      setTrigger(editor.isFocused ? findTrigger(editor.state) : null);
      actualizarIARef.current(editor, transaction);
    },
    onFocus: ({ editor }) => setTrigger(findTrigger(editor.state)),
    onBlur: ({ editor }) => {
      setTrigger(null);
      cancelarIA();
      setOpciones(null);
      if (prediccionKey.getState(editor.state)) editor.view.dispatch(editor.state.tr.setMeta(prediccionKey, OCULTAR));
    },
  });

  /** Corta lo que haya de la IA: la espera por escribir, y el pedido que esté viajando. */
  function cancelarIA() {
    clearTimeout(timerIA.current);
    iaRef.current?.abort();
    iaRef.current = null;
    setCargando(false);
  }

  useEffect(() => cancelarIA, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE_IA) === "0") setIaActiva(false);
    } catch {
      /* sin almacenamiento: queda activada */
    }
  }, []);

  // Otra redacción: contenido nuevo, historial de deshacer nuevo y el cursor al final.
  useEffect(() => {
    if (!editor) return;
    cancelarIA();
    setOpciones(null);
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

  /** La sugerencia gris que está lista para aceptar: solo si el cursor sigue donde se mostró. */
  const fantasmaAceptable = () => {
    if (!editor) return null;
    const g = prediccionKey.getState(editor.state);
    const { selection } = editor.state;
    return g && selection.empty && selection.from === g.pos ? g : null;
  };

  const aceptarFantasma = (g: { text: string; pos: number }) => {
    if (!editor) return;
    const { state, view } = editor;
    view.dispatch(state.tr.insertText(g.text, g.pos).setMeta(prediccionKey, OCULTAR).scrollIntoView());
  };

  /* ───────── palabras de la IA ───────── */

  /** Cada cambio en el texto: se corta lo anterior y, si corresponde, se vuelve a pedir cuando se pare de tipear. */
  const actualizarIA = (ed: Editor, tr: Transaction) => {
    // Cargar otro texto o cambios que no tocan el documento ni el cursor no cuentan.
    if (tr.getMeta("preventUpdate") || (!tr.docChanged && !tr.selectionSet)) return;
    cancelarIA();
    const ctx = activaRef.current && ed.isFocused ? contextoIA(ed.state, 1) : null;
    // Mover el cursor solo borra las palabras: se piden de nuevo al escribir.
    if (!tr.docChanged || !ctx) {
      if (opcionesRef.current) setOpciones(null);
      return;
    }

    const previas = opcionesRef.current;
    if (previas?.modo === "completar") {
      // Siguió escribiendo la misma palabra: las que ya hay se achican a las que todavía la completan.
      // Si lo escrito ya es una de ellas, la palabra puede estar terminada: se vuelve a preguntar qué sigue.
      const terminada = previas.lista.some((o) => fold(o) === fold(ctx.prefijo));
      if (!terminada && previas.base === ctx.base && ctx.prefijo.length > previas.prefijo.length && fold(ctx.prefijo).startsWith(fold(previas.prefijo))) {
        const lista = filtrar(previas.lista, ctx.prefijo);
        if (lista.length) {
          setOpciones({ ...previas, prefijo: ctx.prefijo, lista });
          return;
        }
      }
    } else if (previas && !ctx.prefijo && ctx.base === `${previas.base}${previas.prefijo} `) {
      // Pasó de la palabra al espacio: lo que se proponía para lo que sigue sigue valiendo.
      setOpciones({ ...previas, base: ctx.base, prefijo: "" });
      return;
    }
    setOpciones(null);

    // Con una sola letra es muy pronto (pero sí se achicó la lista de arriba); tampoco si ya se sabe que no hay IA.
    const wait = ctx.prefijo.length >= 2 || ctx.prefijo.length === 0;
    if (!wait || !sugerirRef.current || iaSinClave) return;
    const completo = contextoIA(ed.state);
    if (!completo) return;
    timerIA.current = setTimeout(() => void pedirIA(ed, completo, false), ESPERA_IA);
  };
  actualizarIARef.current = actualizarIA;

  const pedirIA = async (ed: Editor, ctx: ContextoIA, manual: boolean) => {
    const sugerir = sugerirRef.current;
    if (!sugerir) return;
    cancelarIA();
    const ctrl = new AbortController();
    iaRef.current = ctrl;
    setCargando(true);
    try {
      const { opciones: lista, modo } = await sugerir({ antes: ctx.antes, despues: ctx.despues, prefijo: ctx.prefijo }, ctrl.signal);
      if (ctrl.signal.aborted || !ed.isFocused) return;
      // Si mientras tanto el cursor ya está en otra palabra, la respuesta no sirve.
      const ahora = contextoIA(ed.state, 1);
      if (!ahora || ahora.base !== ctx.base || ahora.prefijo !== ctx.prefijo) return;
      const visibles = modo === "completar" ? filtrar(lista, ahora.prefijo) : lista;
      if (visibles.length) setOpciones({ base: ahora.base, prefijo: ahora.prefijo, lista: visibles, modo });
      else if (manual) toast("La IA no encontró palabras para sugerir acá.", "error");
    } catch (err) {
      if (ctrl.signal.aborted) return;
      if ((err as { status?: number }).status === 501) iaSinClave = true;
      // Sola no insiste con el aviso (si falla, falla cada vez que se pausa); a pedido siempre contesta.
      const ahora = Date.now();
      if (manual || ahora - ultimoAviso.current > AVISO_IA_MS) {
        ultimoAviso.current = ahora;
        toast(err instanceof Error ? err.message : "La IA no pudo sugerir palabras.", "error");
      }
    } finally {
      if (iaRef.current === ctrl) {
        iaRef.current = null;
        setCargando(false);
      }
    }
  };

  /**
   * Completa con la palabra elegida las letras que se llevan escritas de la actual; si la palabra ya está
   * terminada ("seguir"), la agrega después con su espacio.
   */
  const elegirOpcion = (index: number) => {
    const previa = opcionesRef.current;
    const palabra = previa?.lista[index];
    if (!editor || !previa || !palabra) return false;
    const ctx = contextoIA(editor.state, 1);
    if (!ctx) return false;
    const seguir = previa.modo === "seguir";
    // Si ya se siguió escribiendo y la palabra no encaja, no se pisa nada.
    if (seguir ? ctx.prefijo !== previa.prefijo : ctx.prefijo && !filtrar([palabra], ctx.prefijo).length) return false;

    let texto = palabra;
    const empiezaFrase = !ctx.prefijo && /(^|[.!?\n])\s*$/.test(ctx.base);
    if (!seguir && ctx.prefijo.length >= 2 && ctx.prefijo === ctx.prefijo.toUpperCase() && /\p{L}/u.test(ctx.prefijo)) texto = palabra.toUpperCase();
    else if ((!seguir && /^\p{Lu}/u.test(ctx.prefijo)) || empiezaFrase) texto = palabra.charAt(0).toUpperCase() + palabra.slice(1);

    // Al final de la línea se deja el espacio para seguir; antes de uno que ya está, no.
    const { next } = around(editor.state, ctx.pos, ctx.pos);
    const { state, view } = editor;
    const desde = seguir ? ctx.pos : ctx.pos - ctx.prefijo.length;
    view.dispatch(
      state.tr
        .insertText(`${seguir && ctx.prefijo ? " " : ""}${texto}${next ? "" : " "}`, desde, ctx.pos)
        .setMeta(prediccionKey, OCULTAR)
        .scrollIntoView()
    );
    view.focus();
    return true;
  };

  /** Ctrl+Espacio: pide las palabras ya, sin esperar y aunque el botón ✨ esté apagado. */
  const pedirAhora = () => {
    if (!editor || !sugerirRef.current) return;
    if (!editor.state.selection.empty) editor.commands.setTextSelection(editor.state.selection.to);
    const { state } = editor;
    if (!state.doc.textContent.trim()) {
      toast("Escribí algo primero: la IA sugiere palabras según lo que ya escribiste.", "error");
      return;
    }
    const ctx = contextoIA(state, 1);
    if (!ctx) {
      toast("Poné el cursor al final de una palabra, o después de un espacio, para pedir palabras.", "error");
      return;
    }
    setOpciones(null);
    void pedirIA(editor, ctx, true);
  };

  const alternarIA = () => {
    const nueva = !iaActiva;
    setIaActiva(nueva);
    try {
      localStorage.setItem(CLAVE_IA, nueva ? "1" : "0");
    } catch {
      /* sin almacenamiento: vale hasta cerrar la página */
    }
    if (!nueva) {
      cancelarIA();
      setOpciones(null);
      if (editor && prediccionKey.getState(editor.state)) editor.view.dispatch(editor.state.tr.setMeta(prediccionKey, OCULTAR));
    }
  };

  keyRef.current = (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && opcionesRef.current?.lista.length) {
      // Alt + 1, 2 o 3 (el teclado de arriba o el numérico): inserta esa palabra.
      const n = /^(?:Digit|Numpad)([1-3])$/.exec(e.code);
      if (n && elegirOpcion(Number(n[1]) - 1)) {
        e.preventDefault();
        return true;
      }
    }
    if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      const key = e.key.toLowerCase();
      if (key === "e" || key === "h") {
        e.preventDefault();
        openList(key === "e" ? ":" : "#");
        return true;
      }
      if ((e.key === " " || e.code === "Space") && sugerirRef.current) {
        e.preventDefault();
        pedirAhora();
        return true;
      }
    }
    const g = fantasmaAceptable();
    if (g && editor) {
      const plain = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
      const { $from } = editor.state.selection;
      if (plain && (e.key === "Tab" || (e.key === "ArrowRight" && $from.parentOffset === $from.parent.content.size))) {
        e.preventDefault();
        aceptarFantasma(g);
        return true;
      }
      if (e.key === "Escape") {
        editor.view.dispatch(editor.state.tr.setMeta(prediccionKey, OCULTAR));
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
      <Toolbar
        editor={editor}
        ia={sugerirPalabras ? { activa: iaActiva, cargando, onToggle: alternarIA } : undefined}
      />
      <EditorContent editor={editor} className={className} />
      {sugerirPalabras && (iaActiva || cargando || !!opciones) && (
        <PalabrasIA
          lista={opciones?.lista ?? []}
          cargando={cargando}
          onElegir={(index) => {
            if (!elegirOpcion(index)) editor?.view.focus();
          }}
        />
      )}
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

/**
 * Las palabras que propone la IA, abajo a la izquierda del texto, en burbujas negras: un clic o
 * Alt+1/2/3 y se completan. La franja ocupa su lugar aunque esté vacía, para que nada salte al aparecer.
 */
function PalabrasIA({
  lista,
  cargando,
  onElegir,
}: {
  lista: string[];
  cargando: boolean;
  onElegir: (index: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Palabras sugeridas por la IA"
      aria-live="polite"
      className="sticky bottom-14 z-10 flex min-h-[2.75rem] flex-wrap items-center gap-1.5 px-4 pb-2 pt-1 sm:px-6"
    >
      {lista.map((palabra, index) => (
        <button
          key={palabra}
          type="button"
          aria-keyshortcuts={`Alt+${index + 1}`}
          onMouseDown={keepFocus}
          onClick={() => onElegir(index)}
          className="inline-flex items-center gap-2 rounded-full bg-foreground py-1.5 pl-3.5 pr-2 text-sm font-medium text-white shadow-sm transition-transform duration-150 animate-in fade-in-0 slide-in-from-bottom-1 hover:-translate-y-px active:scale-95"
        >
          {palabra}
          <kbd className="rounded-full bg-white/15 px-1.5 py-0.5 font-ui text-[10px] font-medium leading-none text-white/70">
            Alt {index + 1}
          </kbd>
        </button>
      ))}
      {cargando && !lista.length && (
        <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.07] px-3 py-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          Pensando palabras…
        </span>
      )}
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  shortcut,
  active,
  disabled,
  spin,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  spin?: boolean;
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
        <Icon className={cn("h-4 w-4", spin && "animate-spin")} />
      </button>
    </Hint>
  );
}

const Sep = () => <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;

/** La barra de formato, pegada arriba del texto mientras se scrollea. */
function Toolbar({
  editor,
  ia,
}: {
  editor: Editor | null;
  /** El botón ✨: enciende o apaga las sugerencias al escribir (el texto gris y las palabras de la IA). */
  ia?: { activa: boolean; cargando: boolean; onToggle: () => void };
}) {
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
        {ia && (
          <>
            <ToolButton
              icon={ia.cargando ? Loader2 : Sparkles}
              spin={ia.cargando}
              label={ia.activa ? "Sugerencias al escribir: activadas" : "Sugerencias al escribir: apagadas"}
              shortcut="texto gris y palabras de la IA · Ctrl Espacio pide palabras ya"
              active={ia.activa}
              disabled={off}
              onClick={ia.onToggle}
            />
            <Sep />
          </>
        )}
        <ToolButton icon={Undo2} label="Deshacer" shortcut="Ctrl Z" disabled={off || !editor.can().undo()} onClick={run((e) => e.chain().focus().undo().run())} />
        <ToolButton icon={Redo2} label="Rehacer" shortcut="Ctrl Y" disabled={off || !editor.can().redo()} onClick={run((e) => e.chain().focus().redo().run())} />
      </span>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-card px-1 font-ui text-[10px] font-medium">{children}</kbd>;
}
