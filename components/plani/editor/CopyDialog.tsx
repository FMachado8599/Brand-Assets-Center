"use client";

import { useMemo, useRef, useState } from "react";
import { Hash, Smile } from "lucide-react";
import { HashtagPanel } from "@/components/redaccion/HashtagPanel";
import { WritingEditor, type HashtagOption, type WritingEditorHandle } from "@/components/redaccion/WritingEditor";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BotonPegar } from "@/components/ui/pegar";
import { toast } from "@/components/ui/toaster";
import { useBrandKits } from "@/hooks/useBrandKits";
import { usePrediccion } from "@/hooks/usePrediccion";
import { useSharedEmojis } from "@/hooks/useSharedEmojis";
import { copyHtml, copyTexto, largoCopy, limiteCopy } from "@/lib/plani/copy";
import type { Pieza, PiezaPatch } from "@/lib/plani/types";
import { extractHashtags } from "@/lib/redaccion/text";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "../emojis";
import { anchoMockup, Mockup } from "../Mockups";

/**
 * Redactar el copy con el editor de Redacción: ":" + dos letras sugiere emojis (también por
 * significado: ":festejo" → 🎉), "#" sugiere los hashtags del cliente, Ctrl+E / Ctrl+H abren esas
 * listas y las negritas salen en Unicode, como se publican. A la izquierda el mockup (se ve cómo
 * queda mientras se escribe) y a la derecha los paneles de emojis y hashtags del cliente.
 * El copy es uno solo para todas las redes.
 */
export function CopyDialog({
  open,
  onOpenChange,
  pieza,
  brand,
  otrosCopys,
  update,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pieza: Pieza;
  brand: Brand;
  /** Los copys de toda la plani: sus hashtags se sugieren como "en la presentación". */
  otrosCopys: string[];
  update: (patch: PiezaPatch, ahora?: boolean) => void;
}) {
  const [panel, setPanel] = useState<"emojis" | "hashtags">("emojis");
  const editor = useRef<WritingEditorHandle>(null);
  const emojis = useSharedEmojis();
  const kits = useBrandKits();
  const kit = kits.kitOf(brand.id);
  // El editor trabaja con su HTML; lo que se guarda y se ve en el mockup es el texto tal cual se publica.
  const [html, setHtml] = useState(() => copyHtml(pieza));

  const texto = copyTexto(pieza);
  const largo = largoCopy(texto);
  const limite = limiteCopy(pieza.plataformas);

  const enTexto = useMemo(() => extractHashtags(texto), [texto]);
  // Texto predictivo con el vocabulario del cliente (sus planis y redacciones) y el resto de esta plani.
  const predecir = usePrediccion(
    brand.id,
    useMemo(() => otrosCopys.filter((c) => c !== texto), [otrosCopys, texto])
  );
  const deLaPlani = useMemo(() => {
    const vistos = new Set(kit.hashtags.map((t) => t.toLowerCase()));
    const out: string[] = [];
    for (const c of otrosCopys)
      for (const t of extractHashtags(c))
        if (!vistos.has(t.toLowerCase())) {
          vistos.add(t.toLowerCase());
          out.push(t);
        }
    return out.slice(0, 40);
  }, [otrosCopys, kit.hashtags]);

  const hashtagPool = useMemo<HashtagOption[]>(
    () => [...kit.hashtags.map((tag) => ({ tag, hint: brand.name })), ...deLaPlani.map((tag) => ({ tag, hint: "en la presentación" }))],
    [kit.hashtags, deLaPlani, brand.name]
  );
  const emojiPool = useMemo(() => {
    const ids = new Set(kit.emojis.map((e) => e.i));
    return [...kit.emojis, ...emojis.recents.filter((e) => !ids.has(e.i))];
  }, [kit.emojis, emojis.recents]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[min(46rem,94vh)] max-w-6xl p-0"
        // Al abrir, el cursor va directo al texto (al final), no al diálogo.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => editor.current?.focus(), 0);
        }}
        // Esc con una sugerencia en gris o la lista de emojis/hashtags abierta cierra solo eso, no el popup.
        onEscapeKeyDown={(e) => {
          if (editor.current?.escape()) e.preventDefault();
        }}
      >
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>Copy {pieza.titulo ? `· ${pieza.titulo}` : ""}</DialogTitle>
          <DialogDescription>
            Uno solo para todas las redes. <kbd className="rounded border px-1 text-[11px]">:</kbd> + dos letras busca emojis,{" "}
            <kbd className="rounded border px-1 text-[11px]">#</kbd> los hashtags de {brand.name}. Se guarda solo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 pb-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_20rem] md:overflow-hidden">
          <div className={cn("mx-auto hidden w-full md:block md:overflow-y-auto", anchoMockup(pieza))}>
            <Mockup pieza={pieza} brand={brand} />
          </div>

          <div className="relative flex min-h-0 flex-col">
            <BotonPegar onTexto={(t) => editor.current?.insert(t)} className="absolute right-2 top-2 z-10" />
            <div
              className={cn(
                "min-h-[16rem] flex-1 overflow-y-auto rounded-2xl border border-black/[0.08] bg-card focus-within:border-foreground/25",
                // El editor de Redacción está pensado para la página: acá la barra de formato va pegada arriba
                // y el texto ocupa lo que haya.
                "[&_.rd-editor]:min-h-[12rem] [&_.rd-editor]:px-4 [&_.rd-editor]:py-3 [&_.rd-editor]:text-[15px] [&_[role=toolbar]]:top-0"
              )}
            >
              <WritingEditor
                ref={editor}
                value={html}
                openKey={pieza.id}
                tone={emojis.tone}
                emojiPool={emojiPool}
                hashtagPool={hashtagPool}
                onEmojiUsed={emojis.remember}
                predecir={predecir}
                placeholder="Escribí el copy…"
                onChange={(h, plain) => {
                  setHtml(h);
                  const publicado = editor.current?.exports()?.unicode ?? plain;
                  update({ copys: { todas: publicado, html: h } });
                }}
              />
            </div>
            <div className="mt-1.5 flex justify-between gap-3 text-[11px] text-muted-foreground">
              <span>{enTexto.length ? `${enTexto.length} hashtags` : ""}</span>
              <span className={cn("tabular-nums", largo > limite.limite && "font-semibold text-destructive")}>
                {largo}/{limite.limite}
                {pieza.plataformas.length > 1 && ` · el límite de ${limite.label}`}
              </span>
            </div>
          </div>

          <div className="flex h-[26rem] min-h-0 flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-card md:h-auto">
            <div className="flex gap-1 p-2">
              {(
                [
                  ["emojis", "Emojis", Smile],
                  ["hashtags", "Hashtags", Hash],
                ] as const
              ).map(([k, l, Icon]) => (
                <button
                  key={k}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPanel(k)}
                  className={cn(
                    "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors",
                    panel === k ? "bg-foreground text-background" : "hover:bg-secondary"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {l}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {panel === "emojis" ? (
                <EmojiPicker brandId={brand.id} brandName={brand.name} onPick={(e) => editor.current?.insert(e.char)} />
              ) : (
                <HashtagPanel
                  brandName={brand.name}
                  saved={kit.hashtags}
                  inText={enTexto}
                  recent={deLaPlani}
                  onInsert={(tags) => {
                    const faltan = tags.length === 1 ? tags : tags.filter((t) => !enTexto.some((x) => x.toLowerCase() === t.toLowerCase()));
                    if (!faltan.length) return toast("Ya están todos en el texto");
                    editor.current?.insert(faltan.map((t) => `#${t}`).join(" "), { spaced: true });
                  }}
                  onSave={(tags) => {
                    kits.addHashtags(brand.id, tags);
                    toast(tags.length === 1 ? `#${tags[0]} guardado en ${brand.name}` : `${tags.length} hashtags guardados en ${brand.name}`);
                  }}
                  onForget={(tag) => kits.removeHashtag(brand.id, tag)}
                />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
