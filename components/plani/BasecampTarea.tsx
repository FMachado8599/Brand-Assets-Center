"use client";

import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { ArrowUpRight, CalendarClock, ChevronDown, Link2Off, MessageSquare, Search } from "lucide-react";
import { Avatar, BasecampMark } from "@/components/tareas/comun";
import { useTipos } from "@/hooks/useTipos";
import { basecampRepo, ETAPA_LABEL, type BcPersona, type TareaCompleta } from "@/lib/plani/basecamp";
import { tipoDeTitulo } from "@/lib/plani/tipos";
import { aDate } from "@/lib/plani/fechas";
import { fold } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";

/** El logo oficial de Basecamp, el mismo del Board (para marcar lo que viene de ahí). */
export { BasecampMark };

export function Personas({ personas, max = 4 }: { personas: BcPersona[]; max?: number }) {
  if (!personas.length) return <span className="text-xs italic text-muted-foreground">Sin asignar</span>;
  return (
    <span className="flex items-center">
      <span className="flex -space-x-1.5">
        {personas.slice(0, max).map((p) => (
          <span key={p.id} title={p.cargo ? `${p.nombre} · ${p.cargo}` : p.nombre}>
            {/* Sin foto, sus iniciales (en vez de una imagen rota). */}
            <Avatar nombre={p.nombre} url={p.avatar_url} className="h-6 w-6 text-[9px] ring-2 ring-card" />
          </span>
        ))}
      </span>
      <span className="ml-2 truncate text-xs text-muted-foreground">
        {personas.map((p) => p.nombre.split(" ")[0]).join(", ")}
      </span>
    </span>
  );
}

function fechaCorta(iso: string) {
  return aDate(iso.slice(0, 10)).toLocaleDateString("es-UY", { day: "numeric", month: "short" });
}

/** La etapa de Basecamp como chip: "Asignada", "En cliente"… */
export function EtapaChip({ tarea }: { tarea: TareaCompleta }) {
  const estado = tarea.columna?.estado;
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-[11px] font-semibold">
      {tarea.sector && <span className="text-muted-foreground">{tarea.sector} ·</span>}
      {(estado && ETAPA_LABEL[estado]) || tarea.columna?.nombre || "Sin columna"}
    </span>
  );
}

/**
 * La tarea de Basecamp de la que sale la plani: el brief tal como lo escribieron, quién está
 * asignado, en qué etapa está y cuándo vence. Se sincroniza sola; para cambiarla, en Basecamp.
 */
export function BasecampTarea({ tareaId, onDesvincular }: { tareaId: number; onDesvincular?: () => void }) {
  const [tarea, setTarea] = useState<TareaCompleta | null>(null);
  const [loading, setLoading] = useState(true);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    basecampRepo.tarea(tareaId).then(({ data }) => {
      if (!vivo) return;
      setTarea(data);
      setLoading(false);
    });
    return () => {
      vivo = false;
    };
  }, [tareaId]);

  const brief = useMemo(
    () => (tarea?.contenido ? DOMPurify.sanitize(tarea.contenido, { USE_PROFILES: { html: true } }) : ""),
    [tarea?.contenido]
  );

  if (loading) return <div className="skeleton h-16 rounded-2xl" />;
  if (!tarea) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-foreground/15 px-4 py-3 text-sm text-muted-foreground">
        <BasecampMark /> La tarea vinculada ya no está en Basecamp (o todavía no se sincronizó).
        {onDesvincular && (
          <button type="button" onClick={onDesvincular} className="ml-auto text-xs font-medium hover:text-foreground">
            Desvincular
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-foreground/[0.06] bg-card/80">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <BasecampMark />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{tarea.titulo}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {tarea.vence && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3 w-3" /> Vence {fechaCorta(tarea.vence)}
              </span>
            )}
            {tarea.comentarios > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> {tarea.comentarios}
              </span>
            )}
            {tarea.actualizada && <span>Movida el {fechaCorta(tarea.actualizada)}</span>}
          </span>
        </span>
        <EtapaChip tarea={tarea} />
        <Personas personas={tarea.personas} />
        <span className="flex items-center gap-1">
          {tarea.app_url && (
            <a
              href={tarea.app_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-full border border-foreground/[0.08] bg-card px-2.5 text-[11px] font-medium shadow-sm hover:bg-secondary"
            >
              Basecamp <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
          {onDesvincular && (
            <button
              type="button"
              aria-label="Desvincular la tarea"
              title="Desvincular la tarea"
              onClick={onDesvincular}
              className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Link2Off className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
      {brief && (
        <div className="border-t border-foreground/[0.06]">
          <button
            type="button"
            onClick={() => setAbierta((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={abierta}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", abierta && "rotate-180")} />
            {abierta ? "Ocultar el brief" : "Ver el brief"}
          </button>
          {abierta && (
            <div
              className="bc-brief rich max-h-[28rem] overflow-y-auto px-4 pb-4 text-sm leading-relaxed [&_a]:underline [&_img]:max-h-64 [&_img]:rounded-lg"
              dangerouslySetInnerHTML={{ __html: brief }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Elegir la tarea de Basecamp de una plani: las del cliente que están vivas, primero las que
 * suenan a plani del mes.
 */
export function TareaPicker({
  brandId,
  mes,
  onPick,
  className,
}: {
  brandId: string;
  mes?: number;
  onPick: (tarea: TareaCompleta) => void;
  className?: string;
}) {
  const [tareas, setTareas] = useState<TareaCompleta[] | null>(null);
  const [q, setQ] = useState("");
  const { tipos } = useTipos();

  useEffect(() => {
    let vivo = true;
    setTareas(null);
    basecampRepo.tareasDeCliente(brandId).then(({ data }) => vivo && setTareas(data));
    return () => {
      vivo = false;
    };
  }, [brandId]);

  const lista = useMemo(() => {
    if (!tareas) return [];
    const f = fold(q.trim());
    const filtradas = f ? tareas.filter((t) => fold(t.titulo).includes(f)) : tareas;
    // Primero las que se reconocen como de algún tipo de presentación y las del mes.
    const score = (t: TareaCompleta) => (tipoDeTitulo(t.titulo, tipos) ? 2 : 0) + (mes && new RegExp(MES_RX[mes - 1], "i").test(fold(t.titulo)) ? 1 : 0);
    return [...filtradas].sort((a, b) => score(b) - score(a));
  }, [tareas, q, mes, tipos]);

  return (
    <div className={className}>
      <label className="relative mb-2 flex items-center">
        <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar tarea…"
          className="h-9 w-full rounded-xl border border-foreground/[0.08] bg-background/60 pl-8 pr-3 text-sm outline-none focus:border-foreground/25"
        />
      </label>
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {tareas === null ? (
          <li className="skeleton h-12 rounded-xl" />
        ) : lista.length ? (
          lista.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPick(t)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-secondary"
              >
                <BasecampMark className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.titulo}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {[t.sector, (t.columna?.estado && ETAPA_LABEL[t.columna.estado]) || t.columna?.nombre, t.personas.map((p) => p.nombre.split(" ")[0]).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))
        ) : (
          <li className="px-2 py-4 text-center text-sm text-muted-foreground">
            {q ? "Ninguna tarea se llama así." : "Este cliente no tiene tareas abiertas en Basecamp (o todavía no se sincronizó)."}
          </li>
        )}
      </ul>
    </div>
  );
}

const MES_RX = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "se?tiembre|sept", "octubre", "noviembre", "diciembre"];
