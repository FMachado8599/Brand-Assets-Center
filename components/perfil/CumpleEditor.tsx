"use client";

import { useEffect, useState } from "react";
import { Cake, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cumpleValido, diasDelMes, MESES, type Cumple } from "@/lib/cumple";
import { cn } from "@/lib/utils";

/**
 * Día y mes del cumpleaños (sin año). Se guarda solo cuando están los dos; "Sacar" lo borra.
 * Lo usan el Perfil (el propio) y la ficha de Organización (un admin, el de cualquiera).
 */
export function CumpleEditor({
  valor,
  guardar,
  disabled,
  compacto,
}: {
  valor: Cumple | null;
  guardar: (c: Cumple | null) => Promise<unknown> | void;
  disabled?: boolean;
  /** Más chico, para la ficha de Organización. */
  compacto?: boolean;
}) {
  const [dia, setDia] = useState<number | null>(valor?.dia ?? null);
  const [mes, setMes] = useState<number | null>(valor?.mes ?? null);

  // Si cambió desde otro lado (o se recargó el equipo), se muestra lo guardado.
  useEffect(() => {
    setDia(valor?.dia ?? null);
    setMes(valor?.mes ?? null);
  }, [valor?.dia, valor?.mes]);

  const cambiar = (d: number | null, m: number | null) => {
    // Si el día no existe en el mes nuevo (31 de abril), queda el último del mes.
    const diaOk = d != null && m != null ? Math.min(d, diasDelMes(m)) : d;
    setDia(diaOk);
    setMes(m);
    if (cumpleValido(diaOk, m) && (diaOk !== valor?.dia || m !== valor?.mes)) guardar({ dia: diaOk, mes: m! });
  };

  const alto = compacto ? "h-8 text-[13px]" : "h-10";
  const dias = Array.from({ length: mes ? diasDelMes(mes) : 31 }, (_, i) => i + 1);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!compacto && <Cake className="h-5 w-5 shrink-0 text-muted-foreground" />}
      <Select value={dia ? String(dia) : undefined} onValueChange={(v) => cambiar(Number(v), mes)} disabled={disabled}>
        <SelectTrigger className={cn(alto, "w-[4.75rem]")} aria-label="Día">
          <SelectValue placeholder="Día" />
        </SelectTrigger>
        <SelectContent>
          {dias.map((d) => (
            <SelectItem key={d} value={String(d)}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={mes ? String(mes) : undefined} onValueChange={(v) => cambiar(dia, Number(v))} disabled={disabled}>
        <SelectTrigger className={cn(alto, "w-[9rem]")} aria-label="Mes">
          <SelectValue placeholder="Mes" />
        </SelectTrigger>
        <SelectContent>
          {MESES.map((m, i) => (
            <SelectItem key={m} value={String(i + 1)}>
              <span className="capitalize">{m}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(dia || mes) && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setDia(null);
            setMes(null);
            if (valor) guardar(null);
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50",
            compacto ? "h-8 text-xs" : "h-9 text-[13px]"
          )}
        >
          <X className="h-3.5 w-3.5" /> Sacar
        </button>
      )}
    </div>
  );
}
