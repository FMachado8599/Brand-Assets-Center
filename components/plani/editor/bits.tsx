"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ESTADOS, FORMATOS, FORMATO_ORDEN } from "@/lib/plani/config";
import type { Formato, PlaniEstado } from "@/lib/plani/types";
import { cn } from "@/lib/utils";
import { FormatDot, FormatIcon } from "../bits";

/**
 * Agregar una pieza: el formato (y la fecha, si no viene del día). Se abre desde la barra, desde
 * cada día y desde el calendario.
 */
export function NuevaPiezaMenu({
  fecha,
  conFecha,
  onCrear,
  children,
  align = "end",
  open,
  onOpenChange,
}: {
  fecha: string;
  conFecha?: boolean;
  onCrear: (fecha: string, formato: Formato) => void;
  children: ReactNode;
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [own, setOwn] = useState(false);
  const isOpen = open ?? own;
  const setOpen = onOpenChange ?? setOwn;
  const [dia, setDia] = useState(fecha);
  // Cada vez que se abre arranca en la fecha que corresponde (la del día tocado o la sugerida).
  useEffect(() => {
    if (isOpen) setDia(fecha);
  }, [isOpen, fecha]);
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-64">
        <p className="mb-2 text-sm font-semibold">Nueva pieza</p>
        {conFecha && (
          <input
            type="date"
            value={dia}
            onChange={(e) => e.target.value && setDia(e.target.value)}
            className="mb-2 h-9 w-full rounded-xl border border-black/[0.08] bg-background/60 px-3 text-sm outline-none"
            aria-label="Fecha de la pieza"
          />
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {FORMATO_ORDEN.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setOpen(false);
                onCrear(conFecha ? dia : fecha, f);
              }}
              className="flex h-16 flex-col items-start justify-between rounded-xl border border-black/[0.06] bg-card p-2.5 text-left text-sm font-medium shadow-sm transition-colors hover:bg-secondary"
            >
              <span className="flex w-full items-center justify-between">
                <FormatIcon formato={f} className="h-4 w-4" />
                <FormatDot formato={f} className="h-2 w-2" />
              </span>
              {FORMATOS[f].label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Las etapas de la plani, de redacción a lista. Click en una para moverla ahí. */
export function EstadoStepper({ value, onChange }: { value: PlaniEstado; onChange: (v: PlaniEstado) => void }) {
  const actual = ESTADOS.findIndex((e) => e.value === value);
  return (
    <ol className="no-scrollbar -mx-4 flex overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Etapa de la presentación">
      {ESTADOS.map((e, i) => {
        const hecho = i < actual;
        const aca = i === actual;
        return (
          <li key={e.value} className="flex min-w-[7.5rem] flex-1 items-center">
            <button
              type="button"
              onClick={() => onChange(e.value)}
              aria-current={aca ? "step" : undefined}
              title={e.hint}
              className="group flex w-full flex-col items-start gap-2 py-1 text-left"
            >
              <span className="flex w-full items-center">
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] font-bold transition-colors",
                    aca && "border-foreground bg-primary text-primary-foreground shadow-[0_0_0_4px_hsl(var(--primary)/0.25)]",
                    hecho && "border-foreground bg-foreground text-background",
                    !aca && !hecho && "border-foreground/25 bg-card text-muted-foreground group-hover:border-foreground/50"
                  )}
                >
                  {hecho ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {i < ESTADOS.length - 1 && <span className={cn("mx-1.5 h-px flex-1", i < actual ? "bg-foreground" : "bg-foreground/15")} />}
              </span>
              <span className={cn("pr-2 text-xs font-medium", aca ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{e.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
