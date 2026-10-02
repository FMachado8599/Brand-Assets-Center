"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { GROUP_LABELS, type Targets } from "@/lib/converter/catalog";
import { cn } from "@/lib/utils";

/** Selector de formato al estilo FreeConvert: familias a la izquierda, grilla de formatos a la derecha. */
export function FormatPicker({
  targets,
  value,
  onChange,
  disabled,
  placeholder = "…",
}: {
  targets: Targets | null;
  value?: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const groups = Object.entries(targets?.groups ?? {});
  const groupOf = (slug?: string) => groups.find(([, list]) => list.some((t) => t.slug === slug))?.[0];
  const [group, setGroup] = useState<string | undefined>();
  const current = group ?? groupOf(value) ?? groups[0]?.[0];
  const list = targets?.groups[current ?? ""] ?? [];

  return (
    <DropdownMenu onOpenChange={(open) => open && setGroup(undefined)}>
      <DropdownMenuTrigger asChild disabled={disabled || !groups.length}>
        <Button variant="outline" size="sm" className="min-w-[5.5rem] justify-between font-mono uppercase">
          {value ?? placeholder}
          <ChevronDown className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex w-[min(22rem,calc(100vw-2rem))] p-0">
        {groups.length > 1 && (
          <div className="flex w-28 shrink-0 flex-col gap-0.5 border-r bg-secondary/60 p-1.5">
            {groups.map(([g]) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:text-foreground",
                  g === current && "bg-card font-medium text-foreground shadow-sm"
                )}
              >
                {GROUP_LABELS[g] ?? g}
              </button>
            ))}
          </div>
        )}
        <div className="grid max-h-72 flex-1 grid-cols-3 content-start gap-1 overflow-y-auto p-1.5">
          {list.map((t) => (
            <DropdownMenuItem
              key={t.slug}
              onSelect={() => onChange(t.slug)}
              className={cn(
                "justify-center rounded-md border border-transparent px-1 py-1.5 font-mono text-xs uppercase",
                t.slug === value && "border-primary bg-primary/15 font-semibold"
              )}
            >
              {t.name}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
