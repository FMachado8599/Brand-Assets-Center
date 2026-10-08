import { Extension } from "@tiptap/react";
import { Fragment, Slice, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { cycleCase } from "@/lib/editor/changeCase";
import { tokenRanges } from "./text";

/**
 * Piezas del editor de Redacción: texto con formato (negrita, cursiva,
 * subrayado, tachado y listas) donde cada línea es un párrafo, así una línea
 * vacía es una línea vacía, como en un posteo.
 */

/** Texto (con saltos de línea) listo para insertar: cada línea, un párrafo. */
export function textSlice(schema: Schema, text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const paragraphs = lines.map((line) => schema.nodes.paragraph.create(null, line ? schema.text(line) : null));
  return new Slice(Fragment.from(paragraphs), 1, 1);
}

const highlightKey = new PluginKey<DecorationSet>("redaccion-resaltado");

function highlights(doc: PMNode) {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    for (const r of tokenRanges(node.textContent)) {
      decorations.push(
        Decoration.inline(pos + 1 + r.from, pos + 1 + r.to, { class: r.kind === "hashtag" ? "rd-hashtag" : "rd-mention" })
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Lo propio de Redacción sobre el editor:
 *  - hashtags y menciones se pintan,
 *  - Shift+F3 cambia mayúsculas/minúsculas (como en Word) y Ctrl+\ quita el formato (como en Docs),
 *  - Shift+Enter es un Enter más (no hay "salto suave" en un posteo),
 *  - pegar texto sin formato (o con Ctrl+Shift+V) respeta las líneas vacías,
 *  - copiar desde el editor separa los párrafos con un salto, no con dos.
 */
export const RedaccionExtras = Extension.create({
  name: "redaccionExtras",

  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () => this.editor.commands.splitBlock(),
      "Shift-F3": () => {
        cycleCase(this.editor);
        return true;
      },
      "Mod-\\": () => this.editor.chain().focus().unsetAllMarks().run(),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: highlightKey,
        state: {
          init: (_, { doc }) => highlights(doc),
          apply: (tr, old) => (tr.docChanged ? highlights(tr.doc) : old),
        },
        props: {
          decorations: (state) => highlightKey.getState(state),
          clipboardTextParser: (text, _context, _plain, view) => textSlice(view.state.schema, text),
          clipboardTextSerializer: (slice) => slice.content.textBetween(0, slice.content.size, "\n"),
        },
      }),
    ];
  },
});

export type Trigger = {
  kind: "emoji" | "hashtag";
  /** Lo escrito después de ":" o "#". */
  query: string;
  /** Posición del ":" o "#". */
  from: number;
  /** El cursor. */
  to: number;
};

/** ":" o "#" a comienzo de palabra, seguido de lo que se va escribiendo. "10:30", "Nota:" o "mail#x" no cuentan. */
const TRIGGER = /(?:^|[\s([{¡¿"'“«])([:#])([\p{L}\p{N}_+-]{0,40})$/u;
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** ¿El cursor está escribiendo un emoji (":fue") o un hashtag ("#chan")? */
export function findTrigger(state: EditorState): Trigger | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $pos = selection.$from;
  if (!$pos.parent.isTextblock) return null;
  const before = $pos.parent.textBetween(0, $pos.parentOffset, undefined, "￼");
  const m = TRIGGER.exec(before);
  if (!m) return null;
  // En el medio de una palabra ("#chan|gan") no se sugiere: completaría a medias.
  const after = $pos.parent.textBetween($pos.parentOffset, Math.min($pos.parent.content.size, $pos.parentOffset + 1), undefined, "￼");
  if (WORD_CHAR.test(after)) return null;
  const query = m[2];
  return { kind: m[1] === "#" ? "hashtag" : "emoji", query, from: $pos.pos - query.length - 1, to: $pos.pos };
}

/** El carácter justo antes y justo después del cursor, dentro de la línea ("" en los bordes). */
export function around(state: EditorState, from: number, to: number) {
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  const prev = $from.parentOffset > 0 ? $from.parent.textBetween($from.parentOffset - 1, $from.parentOffset, undefined, "￼") : "";
  const next =
    $to.parentOffset < $to.parent.content.size
      ? $to.parent.textBetween($to.parentOffset, $to.parentOffset + 1, undefined, "￼")
      : "";
  return { prev, next };
}
