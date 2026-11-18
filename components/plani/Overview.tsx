"use client";

import { Clapperboard, GalleryHorizontalEnd, Plus } from "lucide-react";
import { DIAS_SEMANA, FORMATOS, FORMATO_ORDEN, MESES } from "@/lib/plani/config";
import { enElMes, hoyISO, partes, semanasDelMes } from "@/lib/plani/fechas";
import type { Pieza } from "@/lib/plani/types";
import { cn } from "@/lib/utils";
import { FormatDot, useMedioUrl } from "./bits";
import { finales, portadaDe } from "./Mockups";

/**
 * El calendario del mes, como la slide de siempre: un punto de color por pieza (post, carrusel,
 * reel, historia). Click en un día con piezas lleva a ellas; en uno vacío, agrega una.
 */
export function Calendario({
  anio,
  mes,
  piezas,
  onDia,
  onAgregar,
  compacto,
  className,
}: {
  anio: number;
  mes: number;
  piezas: Pick<Pieza, "id" | "fecha" | "formato">[];
  onDia?: (fecha: string) => void;
  onAgregar?: (fecha: string) => void;
  compacto?: boolean;
  className?: string;
}) {
  const porDia = new Map<string, Pick<Pieza, "id" | "fecha" | "formato">[]>();
  for (const p of piezas) porDia.set(p.fecha, [...(porDia.get(p.fecha) ?? []), p]);
  const hoy = hoyISO();
  const fuera = piezas.filter((p) => !enElMes(p.fecha, anio, mes)).length;
  const usados = FORMATO_ORDEN.filter((f) => piezas.some((p) => p.formato === f));

  return (
    <div className={className}>
      <div className="grid grid-cols-7 border-l border-t border-foreground/15">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="border-b border-r border-foreground/15 px-1.5 py-1 text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d.slice(0, 2)}</span>
          </div>
        ))}
        {semanasDelMes(anio, mes)
          .flat()
          .map((fecha, i) => {
            if (!fecha) return <div key={`v${i}`} className="border-b border-r border-foreground/15 bg-foreground/[0.025]" />;
            const items = porDia.get(fecha) ?? [];
            const dia = partes(fecha).dia;
            const clickable = items.length ? onDia : onAgregar;
            return (
              <button
                key={fecha}
                type="button"
                disabled={!clickable}
                onClick={() => clickable?.(fecha)}
                aria-label={`${dia} de ${MESES[mes - 1]}: ${items.length ? `${items.length} ${items.length === 1 ? "pieza" : "piezas"}` : "sin piezas"}`}
                className={cn(
                  "group relative flex flex-col items-start border-b border-r border-foreground/15 p-1.5 text-left transition-colors enabled:hover:bg-primary/15",
                  compacto ? "min-h-[3.25rem]" : "min-h-[4.5rem] sm:min-h-[5.25rem]"
                )}
              >
                <span className={cn("text-[11px] tabular-nums text-muted-foreground", fecha === hoy && "rounded-full bg-foreground px-1.5 font-semibold text-background")}>
                  {String(dia).padStart(2, "0")}
                </span>
                {items.length > 0 ? (
                  <span className="mt-auto flex flex-wrap gap-1 pt-1">
                    {items.map((p) => (
                      <FormatDot key={p.id} formato={p.formato} className={compacto ? "h-2 w-2" : "h-3 w-3 sm:h-3.5 sm:w-3.5"} />
                    ))}
                  </span>
                ) : (
                  onAgregar && (
                    <Plus className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  )
                )}
              </button>
            );
          })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {(usados.length ? usados : FORMATO_ORDEN).map((f) => (
          <span key={f} className="inline-flex items-center gap-1.5">
            <FormatDot formato={f} /> {FORMATOS[f].label}
          </span>
        ))}
        {fuera > 0 && <span className="ml-auto">{fuera} fuera del mes</span>}
      </div>
    </div>
  );
}

/**
 * El feed como va a quedar en el perfil: lo más nuevo arriba a la izquierda, en la grilla 3:4 de
 * Instagram. Las historias y los banners no van al feed.
 */
export function FeedGrid({
  piezas,
  onPieza,
  className,
}: {
  piezas: Pieza[];
  onPieza?: (id: string) => void;
  className?: string;
}) {
  const medioUrl = useMedioUrl();
  const feed = piezas.filter((p) => p.formato !== "historia" && p.formato !== "banner").sort((a, b) => b.fecha.localeCompare(a.fecha) || b.orden - a.orden);
  if (!feed.length) {
    return (
      <div className={cn("grid aspect-[3/4] place-items-center rounded-xl border border-dashed border-foreground/15 p-6 text-center text-sm text-muted-foreground", className)}>
        Los posts, carruseles y reels van a aparecer acá como en el perfil.
      </div>
    );
  }
  return (
    <div className={cn("grid grid-cols-3 gap-[2px] overflow-hidden rounded-xl bg-foreground/10", className)}>
      {feed.map((p) => {
        const img = p.formato === "reel" ? portadaDe(p) ?? finales(p)[0] : finales(p)[0];
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPieza?.(p.id)}
            className="group relative aspect-[3/4] overflow-hidden bg-secondary"
            aria-label={`${FORMATOS[p.formato].label} del ${partes(p.fecha).dia}`}
          >
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={medioUrl(img, 400)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" draggable={false} />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2" style={{ background: `${FORMATOS[p.formato].color}33` }}>
                <span className="font-display text-2xl leading-none">{partes(p.fecha).dia}</span>
                <span className="line-clamp-2 text-center text-[10px] text-muted-foreground">{p.titulo || "Pendiente"}</span>
              </span>
            )}
            {p.formato === "carrusel" && <GalleryHorizontalEnd className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-white drop-shadow" />}
            {p.formato === "reel" && <Clapperboard className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-white drop-shadow" />}
          </button>
        );
      })}
    </div>
  );
}
