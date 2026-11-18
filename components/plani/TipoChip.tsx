"use client";

import { iconoDe, type TipoPresentacion } from "@/lib/plani/tipos";
import { cn } from "@/lib/utils";

/**
 * El tipo de una presentación, para reconocerlo de un vistazo: su ícono y su nombre, en su color.
 * `solo`: solo el ícono (en lugares chicos), con el nombre al pasar el mouse.
 */
export function TipoChip({
  tipo,
  solo = false,
  className,
}: {
  tipo: Pick<TipoPresentacion, "nombre" | "color" | "icono">;
  solo?: boolean;
  className?: string;
}) {
  const Icono = iconoDe(tipo);
  return (
    <span
      title={tipo.nombre}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full text-[11px] font-semibold leading-none",
        solo ? "w-6 justify-center" : "px-2.5",
        className
      )}
      style={{ color: tipo.color, background: `${tipo.color}1A`, boxShadow: `inset 0 0 0 1px ${tipo.color}33` }}
    >
      <Icono className="h-3.5 w-3.5" />
      {!solo && <span className="truncate">{tipo.nombre}</span>}
    </span>
  );
}
