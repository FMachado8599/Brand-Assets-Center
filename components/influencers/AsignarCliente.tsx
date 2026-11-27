"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClients } from "@/hooks/useClients";
import { cn } from "@/lib/utils";

const AUTO = "__auto";
const NINGUNO = "__ninguno";

/**
 * De qué cliente es algo (una campaña, un cliente o campaña de Influencity, una publicación).
 * Sin elegir a mano es automático (lo deduce la sincronización); se puede fijar un cliente,
 * "ningún cliente", o volver a lo automático.
 */
export function AsignarCliente({
  value,
  manual,
  onChange,
  label,
  className,
  disabled,
}: {
  value: string | null;
  manual: boolean;
  onChange: (brand: string | null, auto: boolean) => void;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const { clients } = useClients();
  const actual = clients.find((c) => c.id === value) ?? null;
  const elegido = manual ? (value ?? NINGUNO) : AUTO;
  const texto = manual ? (actual?.name ?? "Ningún cliente") : actual ? `${actual.name} · auto` : "Sin cliente · auto";

  return (
    <Select
      value={elegido}
      disabled={disabled}
      onValueChange={(v) => {
        if (v === AUTO) onChange(null, true);
        else onChange(v === NINGUNO ? null : v, false);
      }}
    >
      <SelectTrigger aria-label={label} className={cn("h-8 w-44 rounded-full px-3 text-xs", !actual && "text-muted-foreground", className)}>
        <SelectValue>{texto}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO}>Automático</SelectItem>
        <SelectItem value={NINGUNO}>Ningún cliente</SelectItem>
        <SelectGroup>
          <SelectLabel>Clientes</SelectLabel>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
