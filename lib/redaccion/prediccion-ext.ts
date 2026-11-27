import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findTrigger } from "./editor";

/**
 * El texto predictivo en el editor: la sugerencia aparece en gris después del cursor mientras se
 * escribe. Tab (o → al final de la línea) la acepta y Esc la descarta. La calcula quien usa el
 * editor (`predecir`, con el vocabulario del cliente); acá solo se muestra. No usa IA: es instantáneo.
 */

export type Fantasma = { text: string; pos: number } | null;

export const prediccionKey = new PluginKey<Fantasma>("redaccion-prediccion");

/** Meta para esconderla (Esc, al salir del editor, al elegir una palabra de la IA). */
export const OCULTAR = "ocultar";

function widget(text: string) {
  const span = document.createElement("span");
  span.className = "rd-ghost";
  span.setAttribute("aria-hidden", "true");
  span.textContent = text;
  const tab = document.createElement("span");
  tab.className = "rd-ghost-tab";
  tab.textContent = "Tab";
  span.appendChild(tab);
  return span;
}

export const Prediccion = Extension.create<{ predecir: (antes: string) => string | null }>({
  name: "prediccion",

  addOptions() {
    return { predecir: () => null };
  },

  addProseMirrorPlugins() {
    const predecir = (antes: string) => this.options.predecir(antes);
    return [
      new Plugin<Fantasma>({
        key: prediccionKey,
        state: {
          init: () => null,
          apply(tr, prev, viejo, state) {
            const meta = tr.getMeta(prediccionKey);
            if (meta === OCULTAR) return null;
            if (!tr.docChanged) {
              // Mover el cursor la esconde (salvo que quede donde estaba).
              if (prev && tr.selectionSet && !(state.selection.empty && state.selection.from === prev.pos)) return null;
              return prev;
            }
            // Solo mientras se escribe: unos pocos caracteres más que antes (no al borrar, pegar o cargar otro texto).
            const crecio = state.doc.content.size - viejo.doc.content.size;
            if (crecio < 1 || crecio > 4) return null;
            const { selection } = state;
            if (!selection.empty) return null;
            const $p = selection.$from;
            if (!$p.parent.isTextblock) return null;
            // Al final de la línea o antes de un espacio (en el medio de una palabra, no).
            const despues = $p.parent.textBetween($p.parentOffset, Math.min($p.parent.content.size, $p.parentOffset + 1), undefined, "￼");
            if (despues && !/\s/.test(despues)) return null;
            // Con la lista de emojis o hashtags abierta, manda la lista.
            if (findTrigger(state)) return null;
            const antes = $p.parent.textBetween(0, $p.parentOffset, undefined, "￼");
            const text = predecir(antes);
            return text ? { text, pos: selection.from } : null;
          },
        },
        props: {
          decorations(state) {
            const g = prediccionKey.getState(state);
            if (!g) return null;
            return DecorationSet.create(state.doc, [Decoration.widget(g.pos, () => widget(g.text), { side: 1, key: `ghost:${g.pos}:${g.text}` })]);
          },
        },
      }),
    ];
  },
});
