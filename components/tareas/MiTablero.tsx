"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BarDivider, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { useClients } from "@/hooks/useClients";
import { useEquipo } from "@/hooks/useEquipo";
import { cambiarTarea, useFlujo } from "@/hooks/useFlujo";
import { useStoredState } from "@/hooks/useStoredState";
import {
  armarContexto,
  claveOrden,
  ETAPA_LABEL,
  etapaDe,
  flujoRepo,
  ordenarPorPrioridad,
  ordenEntre,
  responsableDe,
  TONOS_LEYENDA,
  validadoresDe,
  type Contexto,
  type Etapa,
  type TareaFlujo,
} from "@/lib/board/flujo";
import { fold } from "@/lib/redaccion/text";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useArrastre, type Destino } from "./arrastre";
import { BoardNav } from "./comun";
import { SelectSimple } from "./equipo/piezas";
import { LeyendaTonos, TareaCard } from "./TareaCard";
import { TareaDetalle } from "./TareaDetalle";

const TODO = "__todo";
const COLUMNAS: Etapa[] = ["entrada", "redaccion", "diseno", "en_proceso", "validacion", "cliente", "implementacion", "finalizada"];
const TITULO: Partial<Record<Etapa, string>> = { entrada: "Por empezar" };

/** Las pausadas, al fondo de su columna (sin perder su prioridad). */
const conPausadasAlFinal = (lista: TareaFlujo[]) => [...lista.filter((t) => !t.pausada), ...lista.filter((t) => t.pausada)];

/**
 * Board → Mi tablero: las tareas de una persona en columnas por etapa (kanban). Arriba de cada
 * columna, lo más prioritario. Arrastrar dentro de la columna cambia la prioridad; a otra columna,
 * la etapa. Se puede mirar el de otra persona o el de todo el estudio.
 */
export function MiTablero() {
  const { data: equipo, error: errorEquipo, sinMigracion: sinEquipo, loaded: equipoListo } = useEquipo();
  const { tareas, loaded, error, sinMigracion } = useFlujo();
  const { clients } = useClients();
  const [persona, setPersona] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [abierta, setAbierta] = useState<number | null>(null);
  // Las que cada uno sacó de su tablero (se guardan en su cuenta) y si se están mostrando igual.
  const [ocultas, setOcultas] = useStoredState<number[]>("board:ocultas", []);
  const [verOcultas, setVerOcultas] = useState(false);
  const [validaciones, setValidaciones] = useState<Map<number, Set<string>>>(new Map());

  const ctx: Contexto | null = useMemo(() => (equipo ? armarContexto(equipo) : null), [equipo]);
  const marcaPorId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const yo = equipo?.yo ?? null;
  // De quién es el tablero: el elegido o, si no, el propio.
  const quien = persona ?? yo?.equipo_id ?? TODO;
  const quienPersona = quien !== TODO ? (ctx?.porId.get(quien) ?? null) : null;

  // Las tareas de esa persona: las que tiene, las que le toca validar y donde está asignada en
  // Basecamp (si están en manos de otro, se ven más tenues: es lo que le va a llegar).
  const suyas = useMemo(() => {
    if (!ctx) return [] as { t: TareaFlujo; deOtro: boolean }[];
    const q = fold(buscar).trim();
    const coincide = (t: TareaFlujo) => !q || fold(t.titulo).includes(q) || fold(t.proyecto).includes(q) || fold(t.tablero ?? "").includes(q);
    if (quien === TODO) return tareas.filter(coincide).map((t) => ({ t, deOtro: false }));
    const bc = quienPersona?.bc_persona_id ?? null;
    const out: { t: TareaFlujo; deOtro: boolean }[] = [];
    for (const t of tareas) {
      if (!coincide(t)) continue;
      const mia = responsableDe(t, ctx).persona?.id === quien;
      const valida = etapaDe(t) === "validacion" && validadoresDe(t, ctx).some((p) => p.id === quien);
      const asignada = bc != null && t.asignados.includes(bc);
      if (mia || valida || asignada) out.push({ t, deOtro: !mia && !valida });
    }
    return out;
  }, [tareas, ctx, quien, quienPersona, buscar]);

  // Fuera de la vista: las que cada uno ocultó y las pausadas que todavía no empezaron (confunden).
  const ocultasSet = useMemo(() => new Set(ocultas), [ocultas]);
  const escondida = (t: TareaFlujo) => ocultasSet.has(t.id) || (t.pausada && etapaDe(t) === "entrada");
  const nEscondidas = suyas.filter((x) => escondida(x.t)).length;

  const columnas = useMemo(() => {
    const visibles = verOcultas ? suyas : suyas.filter((x) => !escondida(x.t));
    // Las que están en manos de otro o escondidas (cuando se muestran igual) se ven más tenues.
    const deOtro = new Map(visibles.map((x) => [x.t.id, x.deOtro || escondida(x.t)]));
    return COLUMNAS.map((e) => ({
      etapa: e,
      tareas: conPausadasAlFinal(ordenarPorPrioridad(visibles.filter((x) => etapaDe(x.t) === e).map((x) => x.t))),
    }))
      .filter((c) => c.etapa !== "en_proceso" || c.tareas.length)
      .map((c) => ({ ...c, deOtro }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suyas, verOcultas, ocultasSet]);

  // Quién validó cada tarea que está en Validación.
  const enValidacion = useMemo(() => suyas.filter((x) => etapaDe(x.t) === "validacion").map((x) => x.t.id), [suyas]);
  const claveValidacion = enValidacion.join(",");
  const recargarValidaciones = () => flujoRepo.validaciones(enValidacion).then(setValidaciones, () => undefined);
  useEffect(() => {
    recargarValidaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveValidacion]);

  function onSoltar(id: string, desde: string, hacia: Destino) {
    const t = tareas.find((x) => String(x.id) === id);
    const col = columnas.find((c) => c.etapa === hacia.lista);
    if (!t || !col) return;
    const otras = col.tareas.filter((x) => x.id !== t.id);
    const orden = ordenEntre(
      otras[hacia.indice - 1] ? claveOrden(otras[hacia.indice - 1]) : undefined,
      otras[hacia.indice] ? claveOrden(otras[hacia.indice]) : undefined
    );
    if (hacia.lista === desde) {
      cambiarTarea(t.id, { orden }, () => flujoRepo.ordenar(t.id, orden));
      return;
    }
    const etapa = hacia.lista as Etapa;
    cambiarTarea(t.id, { etapa, responsable_id: null, orden }, () => flujoRepo.mover(t.id, etapa, orden), `Pasó a ${TITULO[etapa] ?? ETAPA_LABEL[etapa]}`);
  }

  const { arrastre, destino, fantasma, propsTarjeta, propsLista } = useArrastre(onSoltar);
  const arrastrada = arrastre ? tareas.find((t) => String(t.id) === arrastre.id) : undefined;
  const abiertaTarea = abierta != null ? (tareas.find((t) => t.id === abierta) ?? null) : null;

  const tarjeta = (t: TareaFlujo, extra: Partial<Parameters<typeof TareaCard>[0]> = {}) => {
    const val =
      etapaDe(t) === "validacion" && ctx
        ? (() => {
            const quienes = validadoresDe(t, ctx);
            const hechas = validaciones.get(t.id);
            return { hechas: quienes.filter((p) => hechas?.has(p.id)).length, total: quienes.length };
          })()
        : undefined;
    return (
      <TareaCard
        tarea={t}
        marca={t.brand_id ? (marcaPorId.get(t.brand_id) as Brand | undefined) : undefined}
        responsable={ctx ? responsableDe(t, ctx) : { persona: null, origen: null, sector: null }}
        validacion={val}
        {...extra}
      />
    );
  };

  const opcionesPersona = useMemo(
    () => [
      { value: TODO, label: "Todo el estudio" },
      ...(equipo?.personas ?? [])
        .filter((p) => p.activo)
        .map((p) => ({ value: p.id, label: p.id === yo?.equipo_id ? `${p.nombre} (vos)` : p.nombre })),
    ],
    [equipo, yo?.equipo_id]
  );
  const falta = sinEquipo ? "supabase/migracion-equipo.sql" : sinMigracion ? "supabase/migracion-flujo.sql" : null;
  const titulo = quien === TODO ? "Todo el estudio" : quien === yo?.equipo_id ? "Mi tablero" : `Tablero de ${quienPersona?.nombre.split(" ")[0] ?? "…"}`;

  return (
    <div className="min-h-screen">
      <ContextBar>
        <BoardNav />
        <BarDivider />
        <BarSearch value={buscar} onChange={setBuscar} placeholder="Buscar tarea o marca" />
      </ContextBar>

      <main className="pb-4 pt-[6.5rem]">
        <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-2 px-4 sm:px-6">
          <div className="min-w-0">
            <h1 className="font-display text-4xl leading-none tracking-[-0.01em]">{titulo}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {suyas.length - nEscondidas} {suyas.length - nEscondidas === 1 ? "tarea" : "tareas"} · arriba de cada columna, lo más prioritario
            </p>
          </div>
          {nEscondidas > 0 && (
            <button
              type="button"
              onClick={() => setVerOcultas((v) => !v)}
              aria-pressed={verOcultas}
              title="Las que ocultaste y las pausadas que todavía no empezaron"
              className={cn(
                "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
                verOcultas ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:border-foreground/30"
              )}
            >
              Ocultas · {nEscondidas}
            </button>
          )}
          <div className="w-56">
            <SelectSimple value={quien} onChange={(v) => setPersona(v)} opciones={opcionesPersona} />
          </div>
          <div className="ml-auto">
            <LeyendaTonos tonos={TONOS_LEYENDA} />
          </div>
        </div>

        {falta ? (
          <Aviso>
            Falta correr <code className="rounded bg-ink/10 px-1 text-[12px]">{falta}</code> en Supabase.
          </Aviso>
        ) : error || errorEquipo ? (
          <Aviso>{error ?? errorEquipo}</Aviso>
        ) : !loaded || !equipoListo || !ctx ? (
          <div className="mx-4 flex gap-3 sm:mx-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[60vh] w-[17rem] shrink-0 rounded-3xl" />
            ))}
          </div>
        ) : quien !== TODO && !quienPersona ? (
          <Aviso>Todavía no estás en el equipo. Un admin te puede sumar desde Organización.</Aviso>
        ) : (
          <div data-scroll-x className="flex gap-3 overflow-x-auto px-4 pb-3 sm:px-6" style={{ height: "calc(100dvh - 11rem)" }}>
            {columnas.map((c) => {
              const otras = c.tareas.filter((t) => String(t.id) !== arrastre?.id);
              const aca = arrastre && destino?.lista === c.etapa;
              let k = 0;
              return (
                <section
                  key={c.etapa}
                  className={cn(
                    "flex w-[17rem] shrink-0 flex-col rounded-[1.4rem] bg-secondary/50 transition-colors",
                    aca && "bg-primary/15 ring-2 ring-primary/50"
                  )}
                >
                  <header className="flex items-center gap-2 px-3.5 pb-2 pt-3">
                    <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{TITULO[c.etapa] ?? ETAPA_LABEL[c.etapa]}</h2>
                    <span className="text-xs tabular-nums text-muted-foreground">{c.tareas.length}</span>
                  </header>
                  <div data-scroll-y {...propsLista(c.etapa)} className="min-h-24 flex-1 space-y-2.5 overflow-y-auto px-2 pb-3">
                    {c.tareas.map((t) => {
                      const esta = arrastre?.id === String(t.id);
                      const indicador = !esta && aca && destino?.indice === k ? <Indicador /> : null;
                      if (!esta) k++;
                      return (
                        <Fragment key={t.id}>
                          {indicador}
                          {tarjeta(t, {
                            ...propsTarjeta(String(t.id), c.etapa),
                            deOtro: c.deOtro.get(t.id),
                            modo: esta ? "origen" : "normal",
                            onClick: () => setAbierta(t.id),
                            onKeyDown: (e) => e.key === "Enter" && setAbierta(t.id),
                          })}
                        </Fragment>
                      );
                    })}
                    {aca && destino?.indice === otras.length && <Indicador />}
                    {!c.tareas.length && <p className="px-2 py-6 text-center text-xs text-muted-foreground">{arrastre ? "Soltá acá" : "Nada acá"}</p>}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {arrastre &&
        arrastrada &&
        createPortal(
          <div
            ref={fantasma}
            className="pointer-events-none fixed left-0 top-0 z-[80]"
            style={{ width: arrastre.ancho, transform: `translate3d(${arrastre.x - arrastre.dx}px, ${arrastre.y - arrastre.dy}px, 0) rotate(1.5deg)` }}
          >
            {tarjeta(arrastrada, { modo: "fantasma" })}
          </div>,
          document.body
        )}

      <TareaDetalle
        tarea={abiertaTarea}
        ctx={ctx}
        marca={abiertaTarea?.brand_id ? (marcaPorId.get(abiertaTarea.brand_id) as Brand | undefined) : undefined}
        validaron={abiertaTarea ? (validaciones.get(abiertaTarea.id) ?? new Set()) : new Set()}
        onClose={() => setAbierta(null)}
        onValidado={recargarValidaciones}
        ocultar={
          abiertaTarea
            ? {
                oculta: ocultasSet.has(abiertaTarea.id),
                alternar: () =>
                  setOcultas(ocultasSet.has(abiertaTarea.id) ? ocultas.filter((id) => id !== abiertaTarea.id) : [...ocultas, abiertaTarea.id]),
              }
            : undefined
        }
      />
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="mx-4 rounded-2xl bg-primary/20 p-4 text-center text-sm sm:mx-6">{children}</p>;
}

export function Indicador({ eje = "y" }: { eje?: "x" | "y" }) {
  return eje === "x" ? (
    <div className="w-1 shrink-0 self-stretch rounded-full bg-primary shadow-[0_0_0_3px_rgba(255,209,0,0.25)]" />
  ) : (
    <div className="h-1 rounded-full bg-primary shadow-[0_0_0_3px_rgba(255,209,0,0.25)]" />
  );
}
