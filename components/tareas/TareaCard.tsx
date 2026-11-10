"use client";

import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";
import { ArrowUpRight, CheckCheck, MessageSquare, Pause } from "lucide-react";
import { TONO, tonoDe, type Responsable, type TareaFlujo } from "@/lib/board/flujo";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar } from "./comun";

export const fechaCorta = (iso: string) => {
  const hoy = new Date().toISOString().slice(0, 10);
  if (iso === hoy) return "hoy";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-UY", { day: "numeric", month: "short" });
};

type Props = HTMLAttributes<HTMLDivElement> & {
  tarea: TareaFlujo;
  marca?: Brand;
  responsable: Responsable;
  /** Cuántos validaron y cuántos validan (solo en Validación). */
  validacion?: { hechas: number; total: number };
  /** En el tablero de una persona: la tarea está en manos de otro (se ve más tenue). */
  deOtro?: boolean;
  /** fila: ancho fijo (filas por persona) · columna: ocupa el ancho de la columna. */
  forma?: "fila" | "columna";
  /** Se está arrastrando (queda tenue en su lugar) o es el fantasma que sigue al puntero. */
  modo?: "normal" | "origen" | "fantasma";
};

/**
 * Una tarea: el color dice qué tan urgente es (vencida, vence pronto, en curso, esperando a otro…),
 * como en STATUS. Arriba la marca y el estado; abajo quién la tiene y la fecha de entrega.
 */
export const TareaCard = forwardRef<HTMLDivElement, Props>(function TareaCard(
  { tarea: t, marca, responsable, validacion, deOtro, forma = "columna", modo = "normal", className, style, ...props },
  ref
) {
  const tono = TONO[tonoDe(t)];
  const vencida = tonoDe(t) === "vencida";
  const persona = responsable.persona;
  const estilo: CSSProperties = {
    ...style,
    backgroundImage: tono.bg !== "transparent" ? `radial-gradient(130% 140% at 0% 50%, ${tono.bg}, transparent 70%)` : undefined,
  };
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      style={estilo}
      className={cn(
        "group/tarea relative flex cursor-grab touch-manipulation select-none flex-col gap-2 rounded-[1.1rem] border border-black/[0.05] bg-card/90 p-3.5 text-left shadow-[0_1px_2px_rgba(32,32,32,0.05),0_10px_28px_-12px_rgba(32,32,32,0.14)] backdrop-blur-xl transition-[box-shadow,opacity] [-webkit-touch-callout:none] hover:shadow-[0_2px_4px_rgba(32,32,32,0.06),0_18px_40px_-16px_rgba(32,32,32,0.2)] active:cursor-grabbing",
        forma === "fila" ? "w-64 shrink-0" : "w-full",
        deOtro && "opacity-60",
        modo === "origen" && "opacity-30",
        modo === "fantasma" && "shadow-[0_2px_4px_rgba(32,32,32,0.06),0_24px_48px_-16px_rgba(32,32,32,0.3)] ring-2 ring-primary",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: tono.fg }}>
          {marca?.name ?? t.proyecto}
        </span>
        {t.app_url && (
          <a
            href={t.app_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Abrir en Basecamp"
            aria-label="Abrir en Basecamp"
            className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover/tarea:opacity-100"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        )}
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ color: tono.fg, background: tono.bg === "transparent" ? "rgba(32,32,32,0.06)" : tono.bg }}
          title={t.pausada && t.pausa_motivo ? t.pausa_motivo : undefined}
        >
          {t.pausada && <Pause className="h-2.5 w-2.5" />}
          {tono.label}
        </span>
      </div>

      <p className="line-clamp-2 text-[13px] font-medium leading-snug">{t.titulo || "Sin título"}</p>

      <div className="mt-auto flex items-center gap-2 border-t border-black/[0.06] pt-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {persona ? (
            <>
              <Avatar nombre={persona.nombre} url={persona.avatar_url} className={cn("h-5 w-5 text-[8px]", responsable.origen === "tomada" && "ring-2 ring-primary")} />
              <span className="truncate text-[11px] text-muted-foreground" title={responsable.origen === "tomada" ? "La tomó (o se la pasaron)" : undefined}>
                {persona.nombre.split(" ")[0]}
              </span>
            </>
          ) : (
            <span className="text-[11px] font-medium" style={{ color: TONO.pronto.fg }}>
              Sin asignar
            </span>
          )}
          {t.vence && (
            <span className={cn("shrink-0 text-[11px] tabular-nums", vencida ? "font-semibold" : "text-muted-foreground")} style={vencida ? { color: tono.fg } : undefined}>
              · {fechaCorta(t.vence)}
            </span>
          )}
        </div>
        {validacion && validacion.total > 0 && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground" title="Validaron">
            <CheckCheck className="h-3 w-3" />
            {validacion.hechas}/{validacion.total}
          </span>
        )}
        {t.comentarios > 0 && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            {t.comentarios}
          </span>
        )}
      </div>
    </div>
  );
});

/** Qué quiere decir cada color (va arriba de los tableros). */
export function LeyendaTonos({ tonos }: { tonos: (keyof typeof TONO)[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
      {tonos.map((k) => (
        <li key={k} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10"
            style={{ background: TONO[k].bg === "transparent" ? "transparent" : TONO[k].fg }}
          />
          {TONO[k].label}
        </li>
      ))}
    </ul>
  );
}
