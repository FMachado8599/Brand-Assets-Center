"use client";

import { useMemo, useState } from "react";
import { ClipboardPaste, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scanLinks } from "@/lib/downloads/links";
import type { Platform } from "@/lib/downloads/types";
import { cn } from "@/lib/utils";

const NAMES: Record<Platform, string> = { youtube: "YouTube", instagram: "Instagram", pinterest: "Pinterest" };

/** "3 links: 2 de Instagram y 1 de YouTube". */
function summary(text: string) {
  const { links, ignored } = scanLinks(text);
  if (!links.length) return ignored ? `${ignored === 1 ? "Ese link no es" : "Esos links no son"} de YouTube, Instagram ni Pinterest` : null;
  const counts = new Map<Platform, number>();
  links.forEach((l) => counts.set(l.platform, (counts.get(l.platform) ?? 0) + 1));
  const parts = [...counts].map(([p, n]) => `${n} de ${NAMES[p]}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : parts[0];
  const extra = ignored ? ` (${ignored} no ${ignored === 1 ? "sirve" : "sirven"})` : "";
  return `${links.length} ${links.length === 1 ? "link" : "links"}: ${list}${extra}`;
}

/** Una caja para pegar un mensaje o una lista con varios links: muestra cuántos reconoce antes de agregarlos. */
export function LinkList({
  onAdd,
  onPasteClipboard,
  autoFocus,
  className,
}: {
  /** Devuelve true si agregó algo (entonces la caja se vacía). */
  onAdd: (text: string) => boolean;
  onPasteClipboard?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState("");
  const found = useMemo(() => scanLinks(text).links.length, [text]);
  const hint = useMemo(() => summary(text), [text]);

  const submit = () => {
    if (found && onAdd(text)) setText("");
  };

  return (
    <div className={cn("space-y-2", className)}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
        autoFocus={autoFocus}
        rows={4}
        placeholder="Pegá acá uno o varios links: un mensaje, una lista, lo que tengas. Se reconocen YouTube, Instagram y Pinterest."
        aria-label="Links para agregar"
        className="block w-full resize-y rounded-2xl border border-input bg-card px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className={cn("mr-auto text-xs", found ? "text-foreground" : "text-muted-foreground")} aria-live="polite">
          {hint ?? "Cada link entra como una fila."}
        </p>
        {onPasteClipboard && (
          <Button type="button" variant="ghost" size="sm" onClick={onPasteClipboard}>
            <ClipboardPaste /> Pegar del portapapeles
          </Button>
        )}
        <Button type="button" size="sm" onClick={submit} disabled={!found}>
          <Plus /> Agregar{found > 1 ? ` ${found}` : ""}
        </Button>
      </div>
    </div>
  );
}
