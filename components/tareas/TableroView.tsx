"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Columns3, Users } from "lucide-react";
import { BarDivider, BarSearch, BarSegmented, ContextBar } from "@/components/shell/ContextBar";
import { useClients } from "@/hooks/useClients";
import { useEquipo } from "@/hooks/useEquipo";
import { cambiarTarea, useFlujo } from "@/hooks/useFlujo";
import { useStoredState } from "@/hooks/useStoredState";
import {
  armarContexto,
  claveOrden,
  designadoDe,
  ejecutaSector,
  ETAPA_LABEL,
  etapaDe,
  etapasDe,
  flujoRepo,
  ordenarPorPrioridad,
  ordenEntre,
  responsableDe,
  validadoresDe,
  type Contexto,
  type Etapa,
  type TareaFlujo,
} from "@/lib/board/flujo";
import { fold } from "@/lib/redaccion/text";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useArrastre, type Destino } from "./arrastre";
import { Avatar, BoardNav } from "./comun";
import { SelectSimple } from "./equipo/piezas";
import { TareaCard } from "./TareaCard";
import { TareaDetalle } from "./TareaDetalle";

type Vista = "etapas" | "personas";

/** En la vista por persona: qué etapa trabaja cada sector. */
const ETAPA_DEL_SECTOR: Record<string, Etapa> = {
  redaccion: "redaccion",
  diseno_digital: "diseno",
  cm: "implementacion",
  cuentas: "cliente",
};

const NADIE = "__nadie";

/** Las pausadas, al fondo de su columna (sin perder su prioridad). */
const conPausadasAlFinal = (lista: TareaFlujo[]) => [...lista.filter((t) => !t.pausada), ...lista.filter((t) => t.pausada)];

type Columna = { key: string; titulo: string; persona?: { nombre: string; avatar_url: string | null }; tareas: TareaFlujo[]; recibe: boolean };

/**
 * Board → Tablero. Por etapa: cada columna es una etapa del flujo; arrastrar a otra columna la
 * mueve de etapa, arrastrar dentro de la columna cambia su prioridad. Por persona: cada columna es
 * alguien del sector; arrastrar a otra persona se la pasa.
 */
export function TableroView() {
  const { data: equipo, error: errorEquipo, sinMigracion: sinEquipo } = useEquipo();
  const { tareas, loaded, error, sinMigracion } = useFlujo();
  const { clients } = useClients();
  const [vista, setVista] = useStoredState<Vista>("board:vista", "etapas");
  const [tablero, setTablero] = useStoredState<string>("board:tablero", "Digital");
  const [sectorPersonas, setSectorPersonas] = useStoredState<string>("board:sector-personas", "diseno_digital");
  const [hub, setHub] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [abierta, setAbierta] = useState<number | null>(null);
  const [validaciones, setValidaciones] = useState<Map<number, Set<string>>>(new Map());

  const ctx: Contexto | null = useMemo(() => (equipo ? armarContexto(equipo) : null), [equipo]);
  const marcaPorId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  // Los tableros que hay (Digital primero).
  const tableros = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const t of tareas) if (t.tablero) cuenta.set(t.tablero, (cuenta.get(t.tablero) ?? 0) + 1);
    const orden = ["Digital", "Arte", "Creatividad", "Producción", "Medios"];
    return [...cuenta.entries()].sort((a, b) => {
      const ia = orden.indexOf(a[0]);
      const ib = orden.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b[1] - a[1];
    });
  }, [tareas]);

  const hubActual = equipo?.hubs.find((h) => h.id === hub) ?? null;

  const delTablero = useMemo(() => {
    const q = fold(buscar).trim();
    return tareas
      .filter((t) => t.tablero === tablero)
      .filter((t) => !hubActual || (t.brand_id != null && hubActual.marcas.includes(t.brand_id)))
      .filter((t) => !q || fold(t.titulo).includes(q) || fold(t.proyecto).includes(q));
  }, [tareas, tablero, hubActual, buscar]);

  // Quién validó cada tarea que está en Validación.
  const enValidacion = useMemo(() => delTablero.filter((t) => etapaDe(t) === "validacion").map((t) => t.id), [delTablero]);
  const claveValidacion = enValidacion.join(",");
  const recargarValidaciones = () => flujoRepo.validaciones(enValidacion).then(setValidaciones, () => undefined);
  useEffect(() => {
    recargarValidaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveValidacion]);

  const sectoresPersonas = useMemo(() => {
    if (!equipo) return [];
    if (tablero !== "Digital") return equipo.sectores.filter((s) => s.tablero === tablero || s.id === "cuentas");
    return equipo.sectores.filter((s) => ETAPA_DEL_SECTOR[s.id]);
  }, [equipo, tablero]);
  const sectorElegido = sectoresPersonas.some((s) => s.id === sectorPersonas) ? sectorPersonas : (sectoresPersonas[0]?.id ?? null);
  const etapaPersonas: Etapa | null = sectorElegido ? (ETAPA_DEL_SECTOR[sectorElegido] ?? (tablero === "Digital" ? null : "en_proceso")) : null;

  const columnas: Columna[] = useMemo(() => {
    if (!ctx) return [];
    if (vista === "etapas") {
      return etapasDe(tablero).map((e) => ({
        key: e,
        titulo: ETAPA_LABEL[e],
        tareas: conPausadasAlFinal(ordenarPorPrioridad(delTablero.filter((t) => etapaDe(t) === e))),
        recibe: true,
      }));
    }
    if (!sectorElegido || !etapaPersonas) return [];
    const deLaEtapa = delTablero.filter((t) => etapaDe(t) === etapaPersonas);
    const porPersona = new Map<string, TareaFlujo[]>();
    for (const t of deLaEtapa) {
      const k = responsableDe(t, ctx).persona?.id ?? NADIE;
      porPersona.set(k, [...(porPersona.get(k) ?? []), t]);
    }
    const gente = ctx.data.personas
      .filter((p) => p.activo && ejecutaSector(ctx, p.id, sectorElegido))
      // Con un hub elegido, en Diseño se ve solo su gente (los hubs agrupan diseñadores).
      .filter((p) => !hubActual || sectorElegido !== "diseno_digital" || p.hub_id === hubActual.id)
      // Orden fijo (alfabético): si se ordenara por cantidad, las columnas saltarían al pasar una tarea.
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const cols: Columna[] = gente.map((p) => ({
      key: p.id,
      titulo: p.nombre,
      persona: { nombre: p.nombre, avatar_url: p.avatar_url },
      tareas: conPausadasAlFinal(ordenarPorPrioridad(porPersona.get(p.id) ?? [])),
      recibe: true,
    }));
    const sinNadie = porPersona.get(NADIE) ?? [];
    // "Sin asignar" no recibe: para sacarle una tarea a alguien, se devuelve al designado desde la tarea.
    if (sinNadie.length) cols.unshift({ key: NADIE, titulo: "Sin asignar", tareas: ordenarPorPrioridad(sinNadie), recibe: false });
    return cols;
  }, [ctx, vista, tablero, delTablero, sectorElegido, etapaPersonas, hubActual]);

  function onSoltar(id: string, desde: string, hacia: Destino) {
    const t = tareas.find((x) => String(x.id) === id);
    const col = columnas.find((c) => c.key === hacia.lista);
    if (!t || !col || !col.recibe || !ctx) return;
    const otras = col.tareas.filter((x) => x.id !== t.id);
    const orden = ordenEntre(otras[hacia.indice - 1] ? claveOrden(otras[hacia.indice - 1]) : undefined, otras[hacia.indice] ? claveOrden(otras[hacia.indice]) : undefined);

    if (hacia.lista === desde) {
      cambiarTarea(t.id, { orden }, () => flujoRepo.ordenar(t.id, orden));
      return;
    }
    if (vista === "etapas") {
      const etapa = hacia.lista as Etapa;
      cambiarTarea(t.id, { etapa, responsable_id: null, orden }, () => flujoRepo.mover(t.id, etapa, orden), `Pasó a ${ETAPA_LABEL[etapa]}`);
      return;
    }
    // Por persona: pasársela al designado es devolvérsela.
    const sector = sectorElegido!;
    const designado = designadoDe(ctx, t.brand_id, sector);
    const persona = hacia.lista === designado?.id ? null : hacia.lista;
    const nombre = ctx.porId.get(hacia.lista)?.nombre ?? "";
    cambiarTarea(t.id, { responsable_id: persona, orden }, () => flujoRepo.asignar(t.id, persona, orden), `Ahora la tiene ${nombre}`);
  }

  const { arrastre, destino, fantasma, propsTarjeta, propsLista } = useArrastre(onSoltar);
  const arrastrada = arrastre ? tareas.find((t) => String(t.id) === arrastre.id) : undefined;
  const abiertaTarea = abierta != null ? (tareas.find((t) => t.id === abierta) ?? null) : null;

  const tarjeta = (t: TareaFlujo, extra: Partial<Parameters<typeof TareaCard>[0]> = {}) => {
    // Cuentan los validadores de la tarea (si además valida otro, como un admin, no suma al total).
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

  const faltaAlgo = sinMigracion || sinEquipo;

  return (
    <div className="min-h-screen">
      <ContextBar>
        <BoardNav />
        <BarDivider />
        <BarSegmented<Vista>
          label="Ver por"
          value={vista}
          onChange={setVista}
          options={[
            { value: "etapas", label: "Etapas", icon: Columns3 },
            { value: "personas", label: "Personas", icon: Users },
          ]}
        />
        <BarDivider />
        <BarSearch value={buscar} onChange={setBuscar} placeholder="Buscar tarea o marca" />
      </ContextBar>

      <main className="pb-4 pt-[6.5rem]">
        <div className="mb-3 flex flex-wrap items-center gap-2 px-4 sm:px-6">
          <h1 className="mr-2 font-display text-3xl leading-none">Tablero</h1>
          <div className="flex flex-wrap gap-1.5">
            {tableros.map(([nombre, n]) => (
              <button
                key={nombre}
                type="button"
                onClick={() => setTablero(nombre)}
                className={cn(
                  "h-8 rounded-full border px-3 text-[13px] font-medium",
                  tablero === nombre ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/30"
                )}
              >
                {nombre} <span className="tabular-nums opacity-60">{n}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {vista === "personas" && sectoresPersonas.length > 0 && (
              <div className="w-52">
                <SelectSimple value={sectorElegido} onChange={(v) => v && setSectorPersonas(v)} opciones={sectoresPersonas.map((s) => ({ value: s.id, label: s.nombre }))} />
              </div>
            )}
            {equipo && equipo.hubs.length > 0 && (
              <div className="w-44">
                <SelectSimple value={hub} onChange={setHub} opciones={equipo.hubs.map((h) => ({ value: h.id, label: h.nombre }))} ninguno="Todos los hubs" />
              </div>
            )}
          </div>
        </div>

        {faltaAlgo ? (
          <p className="mx-4 rounded-2xl bg-primary/20 p-4 text-center text-sm sm:mx-6">
            Falta correr en Supabase{" "}
            <code className="rounded bg-ink/10 px-1 text-[12px]">{sinEquipo ? "supabase/migracion-equipo.sql" : "supabase/migracion-flujo.sql"}</code>.
          </p>
        ) : error || errorEquipo ? (
          <p className="mx-4 rounded-2xl bg-primary/20 p-4 text-center text-sm sm:mx-6">{error ?? errorEquipo}</p>
        ) : !loaded || !ctx ? (
          <div className="mx-4 flex gap-3 sm:mx-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[60vh] w-[17.5rem] shrink-0 rounded-3xl" />
            ))}
          </div>
        ) : vista === "personas" && !columnas.length ? (
          <p className="mx-4 rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground sm:mx-6">
            Nadie tiene un puesto de este sector todavía. Cargalo en Equipo.
          </p>
        ) : (
          <div data-scroll-x className="flex gap-3 overflow-x-auto px-4 pb-3 sm:px-6" style={{ height: "calc(100dvh - 10.5rem)" }}>
            {columnas.map((c) => {
              const otras = c.tareas.filter((t) => String(t.id) !== arrastre?.id);
              const aca = arrastre && c.recibe && destino?.lista === c.key;
              let k = 0;
              return (
                <section
                  key={c.key}
                  className={cn("flex w-[17.5rem] shrink-0 flex-col rounded-3xl bg-secondary/55 transition-colors", aca && "bg-primary/15 ring-2 ring-primary/50")}
                >
                  <header className="flex items-center gap-2 px-3.5 pb-2 pt-3">
                    {c.persona && <Avatar nombre={c.persona.nombre} url={c.persona.avatar_url} className="h-6 w-6 text-[9px]" />}
                    <h2 className={cn("min-w-0 flex-1 truncate text-sm font-semibold", c.key === NADIE && "text-muted-foreground")}>{c.titulo}</h2>
                    <span className="text-xs tabular-nums text-muted-foreground">{c.tareas.length}</span>
                  </header>
                  <div data-scroll-y {...(c.recibe ? propsLista(c.key) : {})} className="min-h-24 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
                    {c.tareas.map((t) => {
                      const esta = arrastre?.id === String(t.id);
                      const indicador = !esta && aca && destino?.indice === k ? <Indicador /> : null;
                      if (!esta) k++;
                      return (
                        <Fragment key={t.id}>
                          {indicador}
                          {tarjeta(t, {
                            ...propsTarjeta(String(t.id), c.key),
                            modo: esta ? "origen" : "normal",
                            onClick: () => setAbierta(t.id),
                            onKeyDown: (e) => e.key === "Enter" && setAbierta(t.id),
                          })}
                        </Fragment>
                      );
                    })}
                    {aca && destino?.indice === otras.length && <Indicador />}
                    {!c.tareas.length && <p className="px-2 py-6 text-center text-xs text-muted-foreground">{arrastre ? "Soltá acá" : "Nada por ahora"}</p>}
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
      />
    </div>
  );
}

function Indicador() {
  return <div className="h-1 rounded-full bg-primary shadow-[0_0_0_3px_rgba(255,209,0,0.25)]" />;
}
