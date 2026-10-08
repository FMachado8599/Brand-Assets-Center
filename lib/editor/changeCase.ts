import type { Editor } from "@tiptap/react";
import type { Mark } from "@tiptap/pm/model";
import { applyCase, type CaseMode } from "./textcase";

const LETTER = /[\p{L}\p{N}'’]/u;

/** La palabra donde está el cursor (dentro de la línea), o null si está entre espacios. */
function wordAt(editor: Editor, pos: number) {
  const $pos = editor.state.doc.resolve(pos);
  const text = $pos.parent.textBetween(0, $pos.parent.content.size, undefined, "￼");
  let start = $pos.parentOffset;
  let end = $pos.parentOffset;
  while (start > 0 && LETTER.test(text[start - 1])) start--;
  while (end < text.length && LETTER.test(text[end])) end++;
  if (start === end) return null;
  const base = pos - $pos.parentOffset;
  return { from: base + start, to: base + end };
}

/**
 * Cambia la caja reescribiendo las letras de verdad, no con `text-transform`
 * de CSS: un text-transform es solo visual y al copiar viajaría el texto
 * original. Así, lo que ves es lo que se copia.
 *
 * Sin selección se aplica a todo el texto (`whenEmpty: "doc"`, como en
 * Tarjetas) o a la palabra del cursor (`"word"`, como en Word).
 * Todo va en una sola transacción: un Ctrl+Z lo deshace entero.
 */
export function changeCase(editor: Editor, mode: CaseMode, whenEmpty: "doc" | "word" = "doc") {
  const { state } = editor;
  const { empty } = state.selection;
  let from = state.selection.from;
  let to = state.selection.to;
  const cursor = from;
  if (empty) {
    if (whenEmpty === "doc") {
      from = 0;
      to = state.doc.content.size;
    } else {
      const word = wordAt(editor, from);
      if (!word) return;
      ({ from, to } = word);
    }
  }

  const edits: { start: number; end: number; text: string; marks: readonly Mark[] }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text) return;
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.nodeSize, to);
    if (start >= end) return;
    const slice = node.text.slice(start - pos, end - pos);
    const prev = start > 0 ? state.doc.textBetween(start - 1, start) : "";
    const next = applyCase(slice, mode, prev);
    if (next !== slice) edits.push({ start, end, text: next, marks: node.marks });
  });
  if (!edits.length) return;

  const tr = state.tr;
  // De atrás para adelante: así las posiciones de los tramos previos siguen siendo válidas.
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i];
    tr.replaceWith(e.start, e.end, state.schema.text(e.text, e.marks));
  }
  editor.view.dispatch(tr);

  // Lo seleccionado sigue seleccionado (así se puede volver a cambiar); sin selección, el cursor queda donde estaba.
  const size = editor.state.doc.content.size;
  const selection = !empty ? { from, to: Math.min(to, size) } : whenEmpty === "doc" ? size : cursor;
  editor.chain().focus().setTextSelection(selection).run();
}

/**
 * Shift+F3, como en Word: minúsculas → MAYÚSCULAS → Capitalizar → minúsculas…
 * según cómo esté escrito lo seleccionado (o la palabra del cursor).
 */
export function cycleCase(editor: Editor) {
  const { state } = editor;
  let { from, to } = state.selection;
  if (state.selection.empty) {
    const word = wordAt(editor, from);
    if (!word) return;
    ({ from, to } = word);
  }
  const text = state.doc.textBetween(from, to, " ");
  const mode: CaseMode = text === text.toLowerCase() ? "upper" : text === text.toUpperCase() ? "title" : "lower";
  changeCase(editor, mode, "word");
}
