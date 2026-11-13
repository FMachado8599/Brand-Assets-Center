"use client";

import { useRef, useState } from "react";
import { Combine, Download, FolderInput, Loader2, MoreHorizontal, Plus, Star, Trash2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/tooltip";
import { inkOn } from "@/lib/clients/color";
import { fileDetails, LOGO_FILES_ACCEPT, LOGO_FORMATS, previewOf } from "@/lib/clients/logos";
import type { Brand, BrandLogo, LogoBg, LogoFile, LogoFormat, LogoGroup } from "@/lib/types";
import { cn } from "@/lib/utils";
import { logoBackground } from "../ClientMark";
import { startLogoDrag, useDropZone } from "./logoDrag";

const BG_NEXT: Record<LogoBg, LogoBg> = { light: "dark", dark: "brand", brand: "light" };
const BG_LABEL: Record<LogoBg, string> = { light: "claro", dark: "oscuro", brand: "de su color" };

/** Lo que se puede hacer con un logo (lo resuelve la sección). */
export type LogoActions = {
  rename: (logo: BrandLogo, name: string) => void;
  setBg: (logo: BrandLogo, bg: LogoBg) => void;
  makeFace: (logo: BrandLogo) => void;
  move: (logo: BrandLogo, group: string | null, before?: string) => void;
  merge: (from: BrandLogo, into: BrandLogo) => void;
  removeFormat: (logo: BrandLogo, format: LogoFormat) => void;
  remove: (logo: BrandLogo) => void;
  download: (logo: BrandLogo, file: LogoFile) => void;
  downloadAll: (logo: BrandLogo) => void;
  /** Sube archivos a este logo, se llamen como se llamen. */
  addFiles: (logo: BrandLogo, files: File[]) => void;
  dragStart: (logo: BrandLogo) => void;
  dragEnd: () => void;
  /** Soltaron un logo encima de este: queda antes, en su grupo. */
  dropLogo: (id: string, before: BrandLogo) => void;
};

/**
 * Un logo: su vista previa sobre el fondo que le sienta, su nombre y sus formatos. Cada formato
 * es una etiqueta que lo descarga; el + suma otro. Se arrastra a otro grupo o a otro lugar, y
 * encima se le pueden soltar archivos para sumarle formatos.
 */
export function LogoTile({
  brand,
  logo,
  groups,
  others,
  busy,
  dragging,
  highlight,
  actions,
}: {
  brand: Brand;
  logo: BrandLogo;
  groups: LogoGroup[];
  /** Los otros logos del cliente (para juntarlo con uno). */
  others: BrandLogo[];
  busy: boolean;
  /** Este logo es el que se está arrastrando. */
  dragging: boolean;
  /** El formato por el que se está filtrando. */
  highlight: LogoFormat | null;
  actions: LogoActions;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = previewOf(logo);
  const face = !!brand.logo_path && logo.files.some((f) => f.path === brand.logo_path);
  const bg = logoBackground(brand, logo.bg);
  const ink = inkOn(bg);
  const { over, handlers } = useDropZone({
    onFiles: (files) => actions.addFiles(logo, files),
    onLogo: (id) => id !== logo.id && actions.dropLogo(id, logo),
  });

  const tool =
    "grid h-7 w-7 place-items-center rounded-full bg-black/10 backdrop-blur-sm transition-opacity hover:bg-black/20 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/logo:opacity-100 data-[state=open]:opacity-100";

  return (
    <li className={cn("group/logo flex min-w-0 flex-col gap-2 transition-opacity", dragging && "opacity-40")} {...handlers}>
      <div
        draggable
        onDragStart={(e) => {
          startLogoDrag(e, logo.id);
          // Después de que el navegador saca la «foto» del arrastre: si la página cambia antes, Chrome a veces lo corta.
          setTimeout(() => actions.dragStart(logo), 0);
        }}
        onDragEnd={actions.dragEnd}
        className={cn(
          "relative aspect-square cursor-grab overflow-hidden rounded-2xl ring-1 ring-inset ring-black/[0.08] transition-shadow active:cursor-grabbing",
          over && "ring-2 ring-ring ring-offset-2 ring-offset-card"
        )}
        style={{ background: bg, color: ink }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt={logo.name} draggable={false} className="h-full w-full object-contain p-[14%]" />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="font-display text-4xl leading-none">{LOGO_FORMATS[logo.files[0].format].label}</span>
            <span className="text-[11px] opacity-60">Sin vista previa</span>
          </span>
        )}

        {face && (
          <Hint label={`Es el logo de ${brand.name} en toda la app`}>
            <span className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/10">
              <Star className="h-3.5 w-3.5 fill-current" />
            </span>
          </Hint>
        )}

        <div className="absolute right-2 top-2 flex gap-1">
          <Hint label={`Fondo ${BG_LABEL[logo.bg]} · cambiar a ${BG_LABEL[BG_NEXT[logo.bg]]}`}>
            <button
              type="button"
              onClick={() => actions.setBg(logo, BG_NEXT[logo.bg])}
              aria-label={`Cambiar el fondo de ${logo.name}`}
              className={tool}
            >
              <span
                className="h-3.5 w-3.5 rounded-full ring-1 ring-current"
                style={{ background: logoBackground(brand, BG_NEXT[logo.bg]) }}
              />
            </button>
          </Hint>
          <LogoMenu
            logo={logo}
            groups={groups}
            others={others}
            face={face}
            canFace={!!preview}
            actions={actions}
            onAddFormat={() => fileInput.current?.click()}
            className={tool}
          />
        </div>

        {over === "files" && (
          <span className="pointer-events-none absolute inset-x-2 bottom-2 rounded-full bg-ink/85 px-3 py-1 text-center text-[11px] font-medium text-cream">
            Sumar a «{logo.name}»
          </span>
        )}
        {busy && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center bg-card/60">
            <Loader2 className="h-5 w-5 animate-spin text-foreground" />
          </span>
        )}
      </div>

      <LogoName name={logo.name} onSave={(name) => actions.rename(logo, name)} />

      <div className="-mt-1 flex flex-wrap items-center gap-1">
        {logo.files.map((file) => (
          <Hint key={file.format} label={`Descargar · ${fileDetails(file)}`}>
            <button
              type="button"
              onClick={() => actions.download(logo, file)}
              aria-label={`Descargar ${logo.name} en ${LOGO_FORMATS[file.format].label}`}
              className={cn(
                "inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold tracking-wide transition-colors hover:bg-primary hover:text-primary-foreground",
                LOGO_FORMATS[file.format].vector ? "bg-ink text-cream" : "bg-secondary text-foreground",
                highlight === file.format && "ring-2 ring-ring ring-offset-1 ring-offset-card"
              )}
            >
              {LOGO_FORMATS[file.format].label}
            </button>
          </Hint>
        ))}
        <Hint label="Sumar otro formato de este logo">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label={`Sumar un formato a ${logo.name}`}
            className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-foreground/25 text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
          </button>
        </Hint>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept={LOGO_FILES_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) actions.addFiles(logo, files);
        }}
      />
    </li>
  );
}

/** Un logo que se está subiendo: su lugar, con su nombre, hasta que llega. */
export function PendingTile({ name }: { name: string }) {
  return (
    <li className="flex min-w-0 flex-col gap-2" aria-busy>
      <div className="skeleton grid aspect-square place-items-center rounded-2xl">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
      <p className="truncate px-1 text-sm font-semibold text-muted-foreground">{name}</p>
    </li>
  );
}

function LogoMenu({
  logo,
  groups,
  others,
  face,
  canFace,
  actions,
  onAddFormat,
  className,
}: {
  logo: BrandLogo;
  groups: LogoGroup[];
  others: BrandLogo[];
  face: boolean;
  canFace: boolean;
  actions: LogoActions;
  onAddFormat: () => void;
  className: string;
}) {
  return (
    <DropdownMenu>
      <Hint label="Más opciones">
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Opciones de ${logo.name}`} className={className}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-64">
        {canFace && !face && (
          <DropdownMenuItem onSelect={() => actions.makeFace(logo)}>
            <Star /> Usar como logo del cliente
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onAddFormat}>
          <Plus /> Sumar un formato…
        </DropdownMenuItem>
        {logo.files.length > 1 && (
          <DropdownMenuItem onSelect={() => actions.downloadAll(logo)}>
            <Download /> Descargar los {logo.files.length} formatos (.zip)
          </DropdownMenuItem>
        )}

        {(groups.length > 0 || others.length > 0) && <DropdownMenuSeparator />}
        {groups.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput /> Mover a
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={logo.group ?? ""}
                onValueChange={(value) => actions.move(logo, value || null)}
              >
                {groups.map((g) => (
                  <DropdownMenuRadioItem key={g.id} value={g.id}>
                    <span className="truncate">{g.name}</span>
                  </DropdownMenuRadioItem>
                ))}
                <DropdownMenuRadioItem value="">
                  <span className="text-muted-foreground">Sin grupo</span>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {others.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Combine /> Juntar con
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-60">
              {others.map((o) => (
                <DropdownMenuItem key={o.id} onSelect={() => actions.merge(logo, o)}>
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  <span className="shrink-0 text-[10.5px] font-medium tracking-wide text-muted-foreground">
                    {o.files.map((f) => LOGO_FORMATS[f.format].label).join(" ")}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSeparator />
        {logo.files.length > 1 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <X /> Quitar un formato
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {logo.files.map((f) => (
                <DropdownMenuItem key={f.format} onSelect={() => actions.removeFormat(logo, f.format)}>
                  <span className="flex-1">{LOGO_FORMATS[f.format].label}</span>
                  <span className="text-xs text-muted-foreground">{fileDetails(f).split(" · ").slice(1).join(" · ")}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem onSelect={() => actions.remove(logo)} className="text-destructive">
          <Trash2 /> Eliminar el logo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** El nombre, editable en el lugar: se guarda al salir o con Enter; Esc lo deja como estaba. */
function LogoName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  const commit = () => {
    const next = draft?.trim() ?? "";
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (next && next !== name) onSave(next);
  };

  return (
    <input
      value={draft ?? name}
      onFocus={() => setDraft(name)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      maxLength={80}
      aria-label="Nombre del logo"
      className="-mx-1 h-7 min-w-0 truncate rounded-lg bg-transparent px-1 text-sm font-semibold outline-none transition-colors hover:bg-secondary/60 focus:bg-secondary/70"
    />
  );
}
