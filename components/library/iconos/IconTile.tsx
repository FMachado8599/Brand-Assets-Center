"use client";

import { Copy, Download, Loader2, type LucideIcon } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import type { Icon, IconFormat, PngSize } from "@/lib/library/iconos";
import { cn } from "@/lib/utils";
import type { IconAction } from "./IconDialog";

/**
 * Un ícono de la grilla: tocarlo abre el detalle. Al pasar el mouse aparecen copiar y bajar (en SVG); al
 * pasarlo por uno de los dos, suben dos burbujas para elegir el formato: SVG o PNG (del tamaño de la barra).
 */
export function IconTile({
  icon,
  busy,
  size,
  onOpen,
  onAction,
}: {
  icon: Icon;
  busy: boolean;
  size: PngSize;
  onOpen: () => void;
  onAction: (action: IconAction) => void;
}) {
  return (
    // Sin overflow-hidden y arriba de los vecinos al pasar el mouse: en un ícono chico las burbujas pueden asomar por arriba.
    <li className="group relative aspect-square rounded-2xl border bg-card shadow-[0_1px_0_hsl(240_12%_5%/0.04)] transition-shadow focus-within:z-10 hover:z-10 hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        title={icon.name}
        className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl p-3 pb-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <img src={icon.thumb} alt={icon.name} loading="lazy" decoding="async" className="h-12 w-12 object-contain sm:h-14 sm:w-14" draggable={false} />
      </button>
      <p
        className={cn(
          "pointer-events-none absolute inset-x-2 bottom-2 truncate text-center text-[11px] text-muted-foreground transition-opacity",
          "group-focus-within:opacity-0 group-hover:opacity-0 [@media(hover:none)]:opacity-100"
        )}
      >
        {icon.name}
      </p>
      <div
        className={cn(
          "absolute inset-x-0 bottom-1.5 flex justify-center gap-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:hidden",
          busy && "opacity-100"
        )}
      >
        {busy ? (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-cream">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </span>
        ) : (
          <>
            <FormatAction kind="copy" icon={Copy} name={icon.name} size={size} onAction={onAction} />
            <FormatAction kind="download" icon={Download} name={icon.name} size={size} onAction={onAction} />
          </>
        )}
      </div>
    </li>
  );
}

const VERB = { copy: "Copiar", download: "Descargar" } as const;

/**
 * Copiar o bajar: el botón hace SVG y, con el mouse (o el foco) encima, suben las burbujas de formato,
 * centradas en él. El contenedor incluye las burbujas y el espacio entre ellas: subir el mouse no las cierra.
 */
function FormatAction({
  kind,
  icon: Glyph,
  name,
  size,
  onAction,
}: {
  kind: IconAction["kind"];
  icon: LucideIcon;
  name: string;
  size: PngSize;
  onAction: (action: IconAction) => void;
}) {
  const verb = VERB[kind];
  const formats: { format: IconFormat; label: string; hint: string }[] = [
    { format: "svg", label: "SVG", hint: kind === "copy" ? "en vectores, para Figma o Illustrator" : "en vectores" },
    { format: "png", label: "PNG", hint: `de ${size} px, con fondo transparente` },
  ];
  return (
    <div className="group/fmt relative">
      <div
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 flex -translate-x-1/2 translate-y-1 flex-col-reverse items-center gap-1 pb-1.5 opacity-0 transition-[opacity,transform] duration-150",
          "group-focus-within/fmt:pointer-events-auto group-focus-within/fmt:translate-y-0 group-focus-within/fmt:opacity-100",
          "group-hover/fmt:pointer-events-auto group-hover/fmt:translate-y-0 group-hover/fmt:opacity-100"
        )}
      >
        {formats.map((f) => (
          <button
            key={f.format}
            type="button"
            onClick={() => onAction({ kind, format: f.format })}
            aria-label={`${verb} como ${f.label} (${name})`}
            title={`${verb} ${f.label}, ${f.hint}`}
            className="grid h-7 min-w-[2.75rem] place-items-center rounded-full bg-ink px-2 text-[10.5px] font-semibold tracking-wide text-cream shadow-md ring-2 ring-card transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {f.label}
          </button>
        ))}
      </div>
      <Hint label={`${verb} SVG`}>
        <button
          type="button"
          onClick={() => onAction({ kind, format: "svg" })}
          aria-label={`${verb} SVG de ${name}`}
          className="grid h-7 w-7 place-items-center rounded-full bg-ink text-cream transition-colors hover:bg-primary hover:text-primary-foreground group-hover/fmt:bg-primary group-hover/fmt:text-primary-foreground"
        >
          <Glyph className="h-3.5 w-3.5" />
        </button>
      </Hint>
    </div>
  );
}
