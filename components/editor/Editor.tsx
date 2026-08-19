"use client";

import { useEffect, useMemo } from "react";
import { useEditor, EditorContent, type Editor as TipTapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { FontSpec } from "./editor-extensions";
import { applyCase, type CaseMode } from "@/lib/editor/textcase";
import type { FontFace } from "@/lib/types";
import { groupByFamily } from "@/lib/fonts/fonts";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Eraser, Minus, Plus,
  CaseSensitive, CaseUpper, CaseLower, Type,
} from "lucide-react";

type Props = {
  value: string;
  onChange: (html: string, text: string) => void;
  fonts: FontFace[];
};

const NONE = "__none__";

export function Editor({ value, onChange, fonts }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, horizontalRule: false }),
      FontSpec,
      Underline,
      Placeholder.configure({ placeholder: "Escribí el texto de la tarjeta…" }),
    ],
    content: value || "",
    editorProps: {
      attributes: { class: "rich px-4 py-3 min-h-[200px]" },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText()),
  });

  // Refresca el contenido si la tarjeta cambia desde afuera
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  if (!editor) {
    return <div className="h-[300px] rounded-lg border bg-card" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Toolbar editor={editor} fonts={fonts} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor, fonts }: { editor: TipTapEditor; fonts: FontFace[] }) {
  const families = useMemo(() => groupByFamily(fonts), [fonts]);
  const attrs = editor.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string };
  const currentFull = attrs.fontFamily || NONE;
  const currentSize = parseInt(attrs.fontSize || "16", 10) || 16;
  const currentFace = fonts.find((f) => f.full_name === attrs.fontFamily);

  /**
   * Si no hay nada seleccionado, aplica a toda la tarjeta.
   * Es lo que espera alguien acostumbrado a Word: elegís la fuente y
   * cambia el texto, no un cursor invisible.
   */
  const apply = (patch: Record<string, unknown>) => {
    const { empty } = editor.state.selection;
    const chain = editor.chain().focus();
    if (empty) chain.selectAll();
    chain.setMark("textStyle", patch);
    if (empty) chain.setTextSelection(editor.state.doc.content.size);
    chain.run();
  };

  const setFont = (fullName: string) => {
    if (fullName === NONE) {
      apply({ fontFamily: null, fontWeight: null });
      return;
    }
    const face = fonts.find((f) => f.full_name === fullName);
    apply({ fontFamily: fullName, fontWeight: face?.weight ?? null });
  };

  const setSize = (px: number) => {
    const clamped = Math.min(400, Math.max(6, px));
    apply({ fontSize: `${clamped}px` });
  };

  /** Negrita = cambiar al archivo Bold de la misma familia, si existe. */
  const toggleBold = () => {
    if (currentFace) {
      const family = fonts.filter((f) => f.family === currentFace.family);
      const isHeavy = currentFace.weight >= 700;
      const target = isHeavy
        ? family.find((f) => f.weight === 400 && f.italic === currentFace.italic)
        : family.find((f) => f.weight === 700 && f.italic === currentFace.italic);
      if (target) {
        apply({ fontFamily: target.full_name, fontWeight: target.weight });
        return;
      }
    }
    editor.chain().focus().toggleBold().run();
  };

  /**
   * Cambia la caja reescribiendo las letras de verdad, no con
   * `text-transform` de CSS. Un text-transform es solo visual: al copiar,
   * el portapapeles se lleva el texto original en minúscula y en Illustrator
   * pegarías lo de antes. Reescribiendo, lo que ves es lo que viaja.
   *
   * Todo va en una sola transacción, así un Ctrl+Z lo deshace entero.
   */
  const changeCase = (mode: CaseMode) => {
    const { state } = editor;
    const { empty } = state.selection;
    const from = empty ? 0 : state.selection.from;
    const to = empty ? state.doc.content.size : state.selection.to;

    const edits: { start: number; end: number; text: string; marks: readonly any[] }[] = [];

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
    // De atrás para adelante: así las posiciones de los tramos previos siguen siendo válidas
    for (let i = edits.length - 1; i >= 0; i--) {
      const e = edits[i];
      tr.replaceWith(e.start, e.end, state.schema.text(e.text, e.marks as any));
    }
    editor.view.dispatch(tr);

    const size = editor.state.doc.content.size;
    editor
      .chain()
      .focus()
      .setTextSelection(empty ? size : { from, to: Math.min(to, size) })
      .run();
  };

  const btn = (active: boolean): "secondary" | "ghost" => (active ? "secondary" : "ghost");

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b bg-secondary/40 px-2 py-2">
      <div className="min-w-[190px] flex-1">
        <Select value={currentFull} onValueChange={setFont}>
          <SelectTrigger className="h-9 text-[13px]">
            <SelectValue placeholder="Tipografía" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin tipografía asignada</SelectItem>
            {families.map(([family, faces]) => (
              <SelectGroup key={family}>
                <SelectLabel>{family}</SelectLabel>
                {faces.map((f) => (
                  <SelectItem key={f.id} value={f.full_name}>
                    <span style={{ fontFamily: `'${f.full_name}'` }}>{f.style_name}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center rounded-md border border-input bg-card">
        <Button variant="ghost" size="iconSm" onClick={() => setSize(currentSize - 1)} aria-label="Achicar texto">
          <Minus />
        </Button>
        <span className="w-9 text-center text-[13px] tabular-nums">{currentSize}</span>
        <Button variant="ghost" size="iconSm" onClick={() => setSize(currentSize + 1)} aria-label="Agrandar texto">
          <Plus />
        </Button>
      </div>

      <div className="flex items-center gap-0.5">
        <Button variant={btn(editor.isActive("bold") || (currentFace?.weight ?? 0) >= 700)} size="iconSm" onClick={toggleBold} aria-label="Negrita">
          <Bold />
        </Button>
        <Button variant={btn(editor.isActive("italic"))} size="iconSm" onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Cursiva">
          <Italic />
        </Button>
        <Button variant={btn(editor.isActive("underline"))} size="iconSm" onClick={() => editor.chain().focus().toggleUnderline().run()} aria-label="Subrayado">
          <UnderlineIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm" aria-label="Cambiar mayúsculas y minúsculas">
              <CaseSensitive />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => changeCase("upper")}>
              <CaseUpper /> MAYÚSCULAS
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => changeCase("lower")}>
              <CaseLower /> minúsculas
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => changeCase("title")}>
              <Type /> Capitalizar Cada Palabra
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant={btn(editor.isActive("bulletList"))} size="iconSm" onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Lista con viñetas">
          <List />
        </Button>
        <Button variant={btn(editor.isActive("orderedList"))} size="iconSm" onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Lista numerada">
          <ListOrdered />
        </Button>
        <Button variant="ghost" size="iconSm" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} aria-label="Quitar formato">
          <Eraser />
        </Button>
      </div>
    </div>
  );
}
