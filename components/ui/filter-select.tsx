"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, X } from "lucide-react";

export type FilterOption = { value: string; label: string; color?: string; group?: string };

type Props = {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Texto cuando no hay nada que elegir (ej: elegí una marca primero) */
  emptyHint?: string;
  className?: string;
};

/**
 * Filtro de varios valores a la vez. Muestra cuántos hay elegidos en el
 * botón, así la barra de filtros no crece a lo ancho cuando marcás cinco
 * cosas.
 */
export function FilterSelect({ label, options, selected, onChange, emptyHint, className }: Props) {
  const chosen = options.filter((o) => selected.includes(o.value));

  const summary =
    chosen.length === 0
      ? label
      : chosen.length === 1
      ? chosen[0].label
      : `${label} · ${chosen.length}`;

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const groups = React.useMemo(() => {
    const map = new Map<string, FilterOption[]>();
    options.forEach((o) => {
      const key = o.group || "";
      map.set(key, [...(map.get(key) || []), o]);
    });
    return Array.from(map.entries());
  }, [options]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 justify-between gap-2 font-normal",
            chosen.length === 0 && "text-muted-foreground",
            chosen.length > 0 && "border-foreground/30 bg-secondary",
            className
          )}
        >
          <span className="flex items-center gap-1.5 truncate">
            {chosen.length === 1 && chosen[0].color && (
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: chosen[0].color }} />
            )}
            <span className="truncate">{summary}</span>
          </span>
          <ChevronDown className="shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="max-h-80 min-w-[13rem] overflow-y-auto">
        {options.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyHint || "No hay opciones"}</p>
        ) : (
          <>
            {chosen.length > 0 && (
              <>
                <DropdownMenuItem onSelect={() => onChange([])}>
                  <X /> Limpiar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {groups.map(([group, items], gi) => (
              <React.Fragment key={group || gi}>
                {group && <p className="px-2 py-1.5 eyebrow">{group}</p>}
                {items.map((o) => (
                  <DropdownMenuCheckboxItem
                    key={o.value}
                    checked={selected.includes(o.value)}
                    onCheckedChange={() => toggle(o.value)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="flex items-center gap-2">
                      {o.color && <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />}
                      {o.label}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </React.Fragment>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
