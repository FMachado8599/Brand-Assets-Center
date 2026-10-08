"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Cloud, CloudOff, HardDrive, Hash, Loader2, PenLine, Smile } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/tooltip";
import type { BrandLite, SyncState } from "@/lib/redaccion/types";
import { cn } from "@/lib/utils";

/**
 * El nombre de la redacción. Mientras no lo cambies se llama como su primera
 * línea; si lo borrás, vuelve a eso.
 */
export function TitleInput({
  title,
  edited,
  onRename,
  onDone,
}: {
  title: string;
  edited: boolean;
  onRename: (title: string) => void;
  /** Enter: de vuelta al texto. */
  onDone: () => void;
}) {
  // Mientras se escribe se muestra lo tecleado tal cual (aunque quede vacío un momento).
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="group/title relative flex min-w-0 flex-1 items-center">
      <Hint label={edited ? "Nombre de la redacción" : "Se nombra sola con la primera línea: escribí para cambiarlo"} side="bottom">
        <input
          value={draft ?? title}
          onFocus={(e) => {
            setDraft(title);
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value.trim()) onRename(e.target.value);
          }}
          onBlur={() => {
            if (draft !== null && !draft.trim()) onRename("");
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              onDone();
            }
          }}
          maxLength={200}
          aria-label="Nombre de la redacción"
          className={cn(
            "h-10 w-full min-w-0 truncate rounded-xl bg-transparent px-2 text-lg font-semibold tracking-tight outline-none transition-colors placeholder:text-muted-foreground hover:bg-secondary/60 focus:bg-secondary/70 sm:text-xl",
            !edited && draft === null && "text-foreground/55"
          )}
        />
      </Hint>
      <PenLine className="pointer-events-none absolute right-2 hidden h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 sm:block" />
    </div>
  );
}

/**
 * Elegir cliente (en Tarjetas se llaman marcas: es la misma lista).
 * `size="sm"` es el de los paneles, que puede mirar otro cliente que el del texto.
 */
export function ClientPicker({
  brands,
  value,
  onChange,
  loading,
  title = "Cliente del texto",
  size = "md",
  textClient,
}: {
  brands: BrandLite[];
  value: string | null;
  onChange: (brandId: string | null) => void;
  loading?: boolean;
  title?: string;
  size?: "md" | "sm";
  /** El cliente del texto abierto: en la lista se marca "este texto". */
  textClient?: string | null;
}) {
  const brand = brands.find((b) => b.id === value) ?? null;
  const name = brand?.name ?? (value && loading ? "Cargando…" : "Sin cliente");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${title}: ${name}`}
          className={cn(
            "flex shrink-0 items-center rounded-full font-medium transition-colors data-[state=open]:bg-secondary",
            size === "md"
              ? "h-9 max-w-[11rem] gap-2 border bg-card px-3 text-sm shadow-sm hover:bg-secondary"
              : "h-7 max-w-[10rem] gap-1.5 bg-secondary px-2.5 text-xs hover:bg-secondary/70"
          )}
        >
          <span
            aria-hidden
            className={cn("shrink-0 rounded-full ring-1 ring-black/10", size === "md" ? "h-2.5 w-2.5" : "h-2 w-2")}
            style={{ background: brand?.color ?? "transparent" }}
          />
          <span className={cn("truncate", !brand && "text-muted-foreground")}>{name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={size === "md" ? "end" : "start"} className="max-h-80 w-60 overflow-y-auto">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        <ClientItem name="Sin cliente" active={!brand} here={textClient === null} onSelect={() => onChange(null)} />
        {brands.length > 0 && <DropdownMenuSeparator />}
        {brands.map((b) => (
          <ClientItem
            key={b.id}
            name={b.name}
            color={b.color}
            active={b.id === value}
            here={textClient === b.id}
            onSelect={() => onChange(b.id)}
          />
        ))}
        {loading && <p className="px-2 py-2 text-xs text-muted-foreground">Cargando clientes…</p>}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          Los clientes son las marcas de Tarjetas (se agregan en Tarjetas → Ajustes). Cada uno guarda sus emojis y hashtags de
          siempre.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ClientItem({
  name,
  color,
  active,
  here,
  onSelect,
}: {
  name: string;
  color?: string;
  active: boolean;
  here?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
        style={{ background: color ?? "transparent" }}
      />
      <span className="flex-1 truncate">{name}</span>
      {here && <span className="shrink-0 text-[10px] font-medium text-muted-foreground">este texto</span>}
      {active && <Check className="h-4 w-4" />}
    </DropdownMenuItem>
  );
}

const SYNC: Record<SyncState, { icon: typeof Cloud; label: string; hint: string; className?: string }> = {
  local: {
    icon: HardDrive,
    label: "En este navegador",
    hint: "Se guarda solo, en esta computadora. Iniciá sesión para tenerlo en cualquiera.",
  },
  saving: { icon: Loader2, label: "Guardando…", hint: "Subiendo a tu cuenta", className: "[&_svg]:animate-spin" },
  synced: { icon: Cloud, label: "Guardado en tu cuenta", hint: "Está en tu cuenta: aparece en cualquier computadora donde entres." },
  error: {
    icon: CloudOff,
    label: "Sin respaldo",
    hint: "No se pudo guardar en tu cuenta: quedó en este navegador y se reintenta solo.",
    className: "text-destructive",
  },
};

export function SyncBadge({ state }: { state: SyncState }) {
  const s = SYNC[state];
  return (
    <Hint label={s.hint} side="top">
      <span className={cn("flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground", s.className)} role="status">
        <s.icon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{s.label}</span>
      </span>
    </Hint>
  );
}

export type PanelKind = "emojis" | "hashtags";

export const PANELS: { kind: PanelKind; label: string; shortcut: string; icon: typeof Smile }[] = [
  { kind: "emojis", label: "Emojis", shortcut: "Ctrl E", icon: Smile },
  { kind: "hashtags", label: "Hashtags", shortcut: "Ctrl H", icon: Hash },
];

/** Las dos burbujas que abren el panel de emojis o el de hashtags al costado del texto. */
export function Bubble({
  kind,
  open,
  onClick,
  size = "lg",
  badge,
}: {
  kind: PanelKind;
  open: boolean;
  onClick: () => void;
  size?: "lg" | "sm";
  badge?: ReactNode;
}) {
  const panel = PANELS.find((p) => p.kind === kind)!;
  return (
    <Hint label={`${panel.label} · en el texto: ${panel.shortcut}`} side={size === "lg" ? "left" : "top"}>
      <button
        type="button"
        aria-label={panel.label}
        aria-pressed={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cn(
          "relative grid shrink-0 place-items-center rounded-full transition-all active:scale-95",
          size === "lg" ? "floating h-12 w-12 hover:scale-105" : "h-9 w-9 hover:bg-secondary",
          open && "bg-primary text-primary-foreground shadow-md hover:bg-primary",
          open && size === "lg" && "border-transparent"
        )}
      >
        <panel.icon className={size === "lg" ? "h-5 w-5" : "h-[18px] w-[18px]"} strokeWidth={kind === "hashtags" ? 2.4 : 2} />
        {badge}
      </button>
    </Hint>
  );
}
