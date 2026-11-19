"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function Chip({ children, tono = "neutro", className }: { children: ReactNode; tono?: "neutro" | "fuerte" | "suave"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-medium",
        tono === "fuerte" && "bg-foreground text-background",
        tono === "neutro" && "bg-secondary text-foreground",
        tono === "suave" && "border text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

export type Opcion = { value: string; label: string; group?: string; hint?: string };

/**
 * Elegir varios de una lista (puestos de una persona, sectores de un puesto). Cada tilde se guarda
 * al momento: no hay botón de "Guardar".
 */
export function MultiPick({
  opciones,
  elegidos,
  onChange,
  children,
  disabled,
  align = "start",
}: {
  opciones: Opcion[];
  elegidos: string[];
  onChange: (next: string[]) => void;
  /** Lo que se ve (los chips); al tocarlo se abre la lista. */
  children: ReactNode;
  disabled?: boolean;
  align?: "start" | "end";
}) {
  const grupos = useMemo(() => {
    const m = new Map<string, Opcion[]>();
    for (const o of opciones) m.set(o.group ?? "", [...(m.get(o.group ?? "") ?? []), o]);
    return [...m.entries()];
  }, [opciones]);

  if (disabled) return <>{children}</>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-h-8 w-full min-w-0 flex-wrap items-center gap-1 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-secondary/70 data-[state=open]:bg-secondary"
        >
          {children}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-80 min-w-[15rem] overflow-y-auto">
        {grupos.map(([grupo, items], i) => (
          <Fragment key={grupo || i}>
            {i > 0 && <DropdownMenuSeparator />}
            {grupo && <p className="eyebrow px-2 py-1.5 text-muted-foreground">{grupo}</p>}
            {items.map((o) => (
              <DropdownMenuCheckboxItem
                key={o.value}
                checked={elegidos.includes(o.value)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(on) => onChange(on ? [...elegidos, o.value] : elegidos.filter((v) => v !== o.value))}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="truncate text-xs text-muted-foreground">{o.hint}</span>}
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const NINGUNO = "__ninguno";

/** Un select que permite "ninguno" (Radix no acepta el valor vacío). */
export function SelectSimple({
  value,
  onChange,
  opciones,
  ninguno,
  placeholder,
  disabled,
  className,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  opciones: Opcion[];
  /** Texto de la opción vacía; sin esto no se puede dejar vacío. */
  ninguno?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select value={value ?? (ninguno ? NINGUNO : undefined)} onValueChange={(v) => onChange(v === NINGUNO ? null : v)} disabled={disabled}>
      <SelectTrigger className={cn("h-8 text-[13px]", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {ninguno && <SelectItem value={NINGUNO}>{ninguno}</SelectItem>}
        {opciones.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
