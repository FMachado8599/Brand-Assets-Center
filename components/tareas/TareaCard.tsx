"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { CalendarDays, CheckCheck, MessageSquare, Pause } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import type { Responsable, TareaFlujo } from "@/lib/board/flujo";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar } from "./comun";

const hoy = () => new Date().toISOString().slice(0, 10);
export const fechaCorta = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("es-UY", { day: "numeric", month: "short" });

type Props = HTMLAttributes<HTMLDivElement> & {
  tarea: TareaFlujo;
  marca?: Brand;
  responsable: Responsable;
  /** Cuántos validaron y cuántos validan (solo en Validación). */
  validacion?: { hechas: number; total: number };
  /** Se está arrastrando (queda tenue en su lugar) o es el fantasma que sigue al puntero. */
  modo?: "normal" | "origen" | "fantasma";
};

/** Una tarea en el tablero: marca, título, fecha de entrega, quién la tiene y su estado. */
export const TareaCard = forwardRef<HTMLDivElement, Props>(function TareaCard(
  { tarea: t, marca, responsable, validacion, modo = "normal", className, ...props },
  ref
) {
  const vencida = Boolean(t.vence && t.vence < hoy() && !t.pausada);
  const persona = responsable.persona;
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      className={cn(
        "group relative cursor-grab touch-manipulation select-none rounded-2xl border bg-card p-3 text-left shadow-sm transition-[box-shadow,opacity] [-webkit-touch-callout:none] hover:shadow-md active:cursor-grabbing",
        t.pausada && "bg-secondary/60",
        modo === "origen" && "opacity-35",
        modo === "fantasma" && "shadow-2xl ring-2 ring-primary",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5">
        <ClientMark brand={marca ?? { name: t.proyecto, color: "#52525B", logo_url: null, logo_bg: "light" }} className="h-5 w-5 rounded-md text-[8px]" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">{marca?.name ?? t.proyecto}</span>
        {t.pausada && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold" title={t.pausa_motivo ?? "En pausa"}>
            <Pause className="h-2.5 w-2.5" /> Pausa
          </span>
        )}
      </div>
      <p className={cn("mt-1.5 line-clamp-3 text-[13px] font-medium leading-snug", t.pausada && "text-muted-foreground")}>{t.titulo || "Sin título"}</p>
      <div className="mt-2 flex items-center gap-2">
        {t.vence && (
          <span className={cn("inline-flex items-center gap-1 text-[11px] tabular-nums", vencida ? "font-semibold text-destructive" : "text-muted-foreground")}>
            <CalendarDays className="h-3 w-3" />
            {fechaCorta(t.vence)}
          </span>
        )}
        {validacion && validacion.total > 0 && (
          <span className={cn("inline-flex items-center gap-0.5 text-[11px] tabular-nums", validacion.hechas >= validacion.total ? "text-emerald-700" : "text-muted-foreground")} title="Validaron">
            <CheckCheck className="h-3 w-3" />
            {validacion.hechas}/{validacion.total}
          </span>
        )}
        {t.comentarios > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            {t.comentarios}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {persona ? (
            <span className="flex items-center gap-1" title={`${persona.nombre}${responsable.origen === "tomada" ? " (la tomó)" : responsable.origen === "designado" ? " (designado)" : ""}`}>
              {responsable.origen === "tomada" && <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">Tomada</span>}
              <Avatar nombre={persona.nombre} url={persona.avatar_url} className={cn("h-6 w-6 text-[9px]", responsable.origen === "tomada" && "ring-2 ring-primary")} />
            </span>
          ) : responsable.sector ? (
            <span className="rounded-full border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground">Sin asignar</span>
          ) : null}
        </span>
      </div>
    </div>
  );
});
