"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Columns3, Table2, Tags } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
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
  fechaDe,
  flujoRepo,
  ordenarPorPrioridad,
  ordenEntre,
  responsableDe,
  TONO,
  TONOS_LEYENDA,
  tonoDe,
  validadoresDe,
  type Contexto,
  type Etapa,
  type TareaFlujo,
} from "@/lib/board/flujo";
import { ponerPreferencia, usePreferenciasTareas } from "@/hooks/usePreferenciasTareas";
import { ABRIR_TAREA } from "@/lib/notificaciones/prioridad";
import { fold } from "@/lib/redaccion/text";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useArrastre, type Destino } from "./arrastre";
import { BoardNav, InfoBoton, PILDORA } from "./comun";
import { MarcasDialog } from "./equipo/MarcasDialog";
import { SelectSimple } from "./equipo/piezas";
import { fechaCorta, LeyendaTonos, TareaCard } from "./TareaCard";
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
  // Las que cada uno sacó de su tablero (en la base: tampoco avisan) y si se están mostrando igual.
  const preferencias = usePreferenciasTareas();
  const [verOcultas, setVerOcultas] = useState(false);
  // Antes se guardaban solo en la cuenta: se pasan a la base una vez y se borran de ahí.
  const [ocultasViejas, setOcultasViejas] = useStoredState<number[]>("board:ocultas", []);
  useEffect(() => {
    if (!preferencias.loaded || !ocultasViejas.length) return;
    const ids = ocultasViejas;
    setOcultasViejas([]);
    for (const id of ids) if (!preferencias.ocultas.has(id)) ponerPreferencia(id, { oculta: true }).catch(() => undefined);
  }, [preferencias.loaded, preferencias.ocultas, ocultasViejas, setOcultasViejas]);
  const [soloViejas, setSoloViejas] = useState(false);
  const [validaciones, setValidaciones] = useState<Map<number, Set<string>>>(new Map());
  // Tablero (columnas por etapa) o tabla (todas en una lista, en el mismo orden). Se recuerda.
  const [vista, setVista] = useStoredState<"tablero" | "tabla">("board:vista", "tablero");
  const [misMarcas, setMisMarcas] = useState(false);

  // Desde el Inicio: /board?marca=<id> muestra las tareas de esa marca, de todo el estudio.
  const [marca, setMarca] = useState<string | null>(null);

  // Desde la campanita: /board?tarea=123 al entrar, o el evento si ya se está en el Board.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("tarea"));
    const deMarca = params.get("marca");
    if (deMarca) {
      setMarca(deMarca);
      setPersona(TODO);
    }
    if (id) setAbierta(id);
    if (id || deMarca) window.history.replaceState(null, "", window.location.pathname);
    const abrir = (e: Event) => {
      const tarea = Number((e as CustomEvent<number>).detail);
      if (tarea) setAbierta(tarea);
    };
    window.addEventListener(ABRIR_TAREA, abrir);
    return () => window.removeEventListener(ABRIR_TAREA, abrir);
  }, []);

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
    const coincide = (t: TareaFlujo) =>
      (!marca || t.brand_id === marca) && (!q || fold(t.titulo).includes(q) || fold(t.proyecto).includes(q) || fold(t.tablero ?? "").includes(q));
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
  }, [tareas, ctx, quien, quienPersona, buscar, marca]);

  // Fuera de la vista: las que cada uno ocultó y las pausadas que todavía no empezaron (confunden).
  const ocultasSet = preferencias.ocultas;
  const escondida = (t: TareaFlujo) => ocultasSet.has(t.id) || (t.pausada && etapaDe(t) === "entrada");
  const nEscondidas = suyas.filter((x) => escondida(x.t)).length;
  // Las suyas con la fecha de Basecamp vieja: para ponerles una fecha nueva de una.
  const vieja = (x: { t: TareaFlujo; deOtro: boolean }) => !x.deOtro && !escondida(x.t) && tonoDe(x.t) === "vieja";
  const nViejas = suyas.filter(vieja).length;
  const filtrarViejas = soloViejas && nViejas > 0;

  const columnas = useMemo(() => {
    const visibles = filtrarViejas ? suyas.filter(vieja) : verOcultas ? suyas : suyas.filter((x) => !escondida(x.t));
    // Las que están en manos de otro o escondidas (cuando se muestran igual) se ven más tenues.
    const deOtro = new Map(visibles.map((x) => [x.t.id, x.deOtro || escondida(x.t)]));
    return COLUMNAS.map((e) => ({
      etapa: e,
      tareas: conPausadasAlFinal(ordenarPorPrioridad(visibles.filter((x) => etapaDe(x.t) === e).map((x) => x.t))),
    }))
      .filter((c) => c.etapa !== "en_proceso" || c.tareas.length)
      .map((c) => ({ ...c, deOtro }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suyas, verOcultas, ocultasSet, filtrarViejas]);

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
  const visiblesN = suyas.length - nEscondidas;
  const yoPersona = yo?.equipo_id ? (ctx?.porId.get(yo.equipo_id) ?? null) : null;

  return (
    <div className="min-h-screen">
      <ContextBar>
        <BoardNav />
        <BarDivider />
        <BarSearch value={buscar} onChange={setBuscar} placeholder="Buscar tarea o marca" />
        {marca && (
          <>
            <BarDivider />
            <button
              type="button"
              onClick={() => setMarca(null)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-cream/10 px-3 text-[13px] font-medium text-cream hover:bg-cream/15"
            >
              {marcaPorId.get(marca)?.name ?? "Una marca"} <span aria-hidden>✕</span>
            </button>
          </>
        )}
      </ContextBar>

      <main className="pb-4 pt-[6.5rem]">
        <div className="mb-3 flex flex-wrap items-center gap-2 px-4 sm:px-6">
          <div role="tablist" aria-label="Cómo ver las tareas" className="flex rounded-full border bg-card p-0.5">
            {(
              [
                { value: "tablero", label: "Tablero", icon: Columns3 },
                { value: "tabla", label: "Tabla", icon: Table2 },
              ] as const
            ).map((v) => (
              <button
                key={v.value}
                type="button"
                role="tab"
                aria-selected={vista === v.value}
                onClick={() => setVista(v.value)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
                  vista === v.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <v.icon className="h-3.5 w-3.5" /> {v.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {yoPersona && (
              <button
                type="button"
                onClick={() => setMisMarcas(true)}
                title="De qué marcas sos el designado en tu sector: sus tareas nuevas te llegan a vos"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <Tags className="h-3.5 w-3.5" /> Mis marcas
              </button>
            )}
            {nViejas > 0 && (
              <button
                type="button"
                onClick={() => setSoloViejas((v) => !v)}
                aria-pressed={filtrarViejas}
                title="Tuyas con la fecha de Basecamp vencida hace más de dos semanas: abrilas y poneles una fecha nueva"
                className={cn(
                  "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
                  filtrarViejas ? "border-[#8A6A3B] bg-[#8A6A3B] text-white" : "bg-card text-[#8A6A3B] hover:border-[#8A6A3B]/40 dark:text-[#D4B27E]"
                )}
              >
                Fecha vieja · {nViejas}
              </button>
            )}
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
            <SelectSimple value={quien} onChange={(v) => setPersona(v)} opciones={opcionesPersona} className={PILDORA} />
            <InfoBoton>
              <p>
                <strong className="font-medium text-foreground">
                  {visiblesN} {visiblesN === 1 ? "tarea" : "tareas"}
                </strong>
                . {vista === "tablero" ? "Arriba de cada columna, lo más prioritario." : "En el orden de las etapas y, dentro de cada una, lo más prioritario primero."}
              </p>
              <div>
                <p className="mb-1.5 font-medium text-foreground">Colores</p>
                <LeyendaTonos tonos={TONOS_LEYENDA} />
              </div>
              <p className="text-muted-foreground">
                Las más tenues son las que tenés asignadas en Basecamp pero hoy están en manos de otra persona (te van a llegar), o las que ocultaste.
              </p>
            </InfoBoton>
          </div>
        </div>

        {falta ? (
          <Aviso>
            Falta correr <code className="rounded bg-foreground/10 px-1 text-[12px]">{falta}</code> en Supabase.
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
        ) : vista === "tabla" ? (
          <TablaTareas
            filas={columnas.flatMap((c) => c.tareas.map((t) => ({ t, tenue: c.deOtro.get(t.id) ?? false })))}
            ctx={ctx}
            marcaPorId={marcaPorId}
            onAbrir={setAbierta}
          />
        ) : (
          <div data-scroll-x className="flex gap-3 overflow-x-auto px-4 pb-3 sm:px-6" style={{ height: "calc(100dvh - 9.5rem)" }}>
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

      {equipo && (
        <MarcasDialog
          persona={misMarcas ? yoPersona : null}
          data={equipo}
          marcas={clients}
          editable
          propia
          admin={Boolean(yo?.admin)}
          onClose={() => setMisMarcas(false)}
        />
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

/**
 * La vista de tabla de Mi tablero: las mismas tareas que el tablero, en una lista. En el orden de
 * las etapas y, dentro de cada una, por prioridad. Tocar una fila abre la tarea.
 */
function TablaTareas({
  filas,
  ctx,
  marcaPorId,
  onAbrir,
}: {
  filas: { t: TareaFlujo; tenue: boolean }[];
  ctx: Contexto;
  marcaPorId: Map<string, unknown>;
  onAbrir: (id: number) => void;
}) {
  if (!filas.length) return <p className="mx-4 rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground sm:mx-6">Nada acá.</p>;
  return (
    <div className="mx-4 overflow-hidden rounded-3xl border bg-card shadow-sm sm:mx-6">
      <div className="max-h-[calc(100dvh-10.5rem)] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b bg-secondary/80 text-left backdrop-blur">
            <tr className="eyebrow text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Tarea</th>
              <th className="hidden px-3 py-2.5 font-medium md:table-cell">Etapa</th>
              <th className="hidden px-3 py-2.5 font-medium lg:table-cell">La tiene</th>
              <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Entrega</th>
              <th className="px-4 py-2.5 text-right font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filas.map(({ t, tenue }) => {
              const marca = t.brand_id ? (marcaPorId.get(t.brand_id) as Brand | undefined) : undefined;
              const tono = TONO[tonoDe(t)];
              const etapa = etapaDe(t);
              const quien = responsableDe(t, ctx).persona;
              const fecha = fechaDe(t);
              return (
                <tr
                  key={t.id}
                  tabIndex={0}
                  onClick={() => onAbrir(t.id)}
                  onKeyDown={(e) => e.key === "Enter" && onAbrir(t.id)}
                  className={cn("cursor-pointer outline-none transition-colors hover:bg-secondary/50 focus-visible:bg-secondary/50", tenue && "opacity-55")}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ClientMark
                        brand={marca ?? { name: t.proyecto, color: "#52525B", logo_url: null, logo_bg: "light" }}
                        className="h-7 w-7 shrink-0 rounded-md text-[9px]"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.titulo || "Sin título"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {marca?.name ?? t.proyecto}
                          {t.tablero ? ` · ${t.tablero}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2.5 text-muted-foreground md:table-cell">{TITULO[etapa] ?? ETAPA_LABEL[etapa]}</td>
                  <td className="hidden max-w-[10rem] truncate px-3 py-2.5 text-muted-foreground lg:table-cell">{quien?.nombre ?? "—"}</td>
                  <td className={cn("hidden whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground sm:table-cell", fecha.vieja && "line-through decoration-muted-foreground/50")}>
                    {fecha.fecha ? fechaCorta(fecha.fecha) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ color: tono.fg, background: tono.bg === "transparent" ? "var(--tono-gris)" : tono.bg }}
                    >
                      {tono.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
