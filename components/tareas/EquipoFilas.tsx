"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BarDivider, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { toast } from "@/components/ui/toaster";
import { useClients } from "@/hooks/useClients";
import { useEquipo } from "@/hooks/useEquipo";
import { cambiarTarea, useFlujo } from "@/hooks/useFlujo";
import { useStoredState } from "@/hooks/useStoredState";
import type { Persona } from "@/lib/board/equipo";
import {
  armarContexto,
  cargaDe,
  claveOrden,
  designadoDe,
  ejecutaSector,
  etapaDe,
  flujoRepo,
  ordenarPorPrioridad,
  ordenEntre,
  responsableDe,
  TONOS_LEYENDA,
  tonoDe,
  validadoresDe,
  type Contexto,
  type TareaFlujo,
} from "@/lib/board/flujo";
import { fold } from "@/lib/redaccion/text";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useArrastre, type Destino } from "./arrastre";
import { Avatar, BoardNav } from "./comun";
import { SelectSimple } from "./equipo/piezas";
import { Indicador } from "./MiTablero";
import { LeyendaTonos, TareaCard } from "./TareaCard";
import { TareaDetalle } from "./TareaDetalle";

const TODOS = "__todos";
/** Sin elegir: se muestra el sector de quien mira (como en STATUS). */
const AUTO = "";
const AREA = "area:";
const NADIE = "__nadie";

type Fila = { key: string; persona: Persona | null; tareas: TareaFlujo[] };

/** Las pausadas, al final de la fila (sin perder su prioridad). */
const conPausadasAlFinal = (lista: TareaFlujo[]) => [...lista.filter((t) => !t.pausada), ...lista.filter((t) => t.pausada)];

/**
 * Board → Equipo: una fila por persona con sus tareas, de izquierda (lo más prioritario) a derecha.
 * Arrastrar dentro de la fila cambia la prioridad; a otra fila, se la pasa a esa persona. Arriba,
 * lo que no tiene a nadie, para repartir.
 */
export function EquipoFilas() {
  const { data: equipo, error: errorEquipo, sinMigracion: sinEquipo, loaded: equipoListo } = useEquipo();
  const { tareas, loaded, error, sinMigracion } = useFlujo();
  const { clients } = useClients();
  const [elegido, setElegido] = useStoredState<string>("board:equipo-sector", AUTO);
  const [hub, setHub] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [abierta, setAbierta] = useState<number | null>(null);
  const [validaciones, setValidaciones] = useState<Map<number, Set<string>>>(new Map());

  const ctx: Contexto | null = useMemo(() => (equipo ? armarContexto(equipo) : null), [equipo]);
  const marcaPorId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const yo = equipo?.yo?.equipo_id ?? null;
  const hubActual = equipo?.hubs.find((h) => h.id === hub) ?? null;

  // Pestañas: Todos, cada área con más de un sector (ej: Digital = Redacción + Diseño + CM) y cada
  // sector que tiene a alguien que trabaja tareas.
  const { pestanas, sectoresDe } = useMemo(() => {
    if (!equipo || !ctx) return { pestanas: [] as { id: string; nombre: string }[], sectoresDe: new Map<string, Set<string>>() };
    const conGente = equipo.sectores.filter((s) => equipo.personas.some((p) => p.activo && ejecutaSector(ctx, p.id, s.id)));
    const sectoresDe = new Map<string, Set<string>>(conGente.map((s) => [s.id, new Set([s.id])]));
    const areas: { id: string; nombre: string }[] = [];
    for (const area of [...new Set(conGente.map((s) => s.area))]) {
      const de = conGente.filter((s) => s.area === area);
      if (de.length < 2) continue;
      areas.push({ id: AREA + area, nombre: area });
      sectoresDe.set(AREA + area, new Set(de.map((s) => s.id)));
    }
    return { pestanas: [...areas, ...conGente.map((s) => ({ id: s.id, nombre: s.nombre }))], sectoresDe };
  }, [equipo, ctx]);

  // El de quien mira: el sector que trabaja; si trabaja varios o es de dirección, su área.
  const miSector = useMemo(() => {
    if (!ctx || !equipo || !yo) return TODOS;
    const area = (sector: string) => {
      const a = equipo.sectores.find((s) => s.id === sector)?.area;
      return a && sectoresDe.has(AREA + a) ? AREA + a : sector;
    };
    const trabaja = [...(ctx.ejecutaEn.get(yo) ?? [])].filter((s) => sectoresDe.has(s));
    if (trabaja.length === 1) return trabaja[0];
    if (trabaja.length > 1) return area(trabaja[0]);
    const suyos = [...(ctx.sectoresDe.get(yo) ?? [])];
    return suyos.length ? area(suyos[0]) : TODOS;
  }, [ctx, equipo, yo, sectoresDe]);
  const pedido = elegido || miSector;
  const sectorActual = pedido === TODOS || sectoresDe.has(pedido) ? pedido : TODOS;
  const seleccion = sectorActual === TODOS ? null : sectoresDe.get(sectorActual)!;

  const filas: Fila[] = useMemo(() => {
    if (!ctx || !equipo) return [];
    const q = fold(buscar).trim();
    const porPersona = new Map<string, TareaFlujo[]>();
    for (const t of tareas) {
      if (etapaDe(t) === "finalizada") continue;
      if (hubActual && !(t.brand_id && hubActual.marcas.includes(t.brand_id))) continue;
      const r = responsableDe(t, ctx);
      // En un sector (o un área), solo lo de ese sector: a un diseñador no le importa lo de Medios.
      if (seleccion && !(r.sector && seleccion.has(r.sector))) continue;
      const k = r.persona?.id ?? NADIE;
      porPersona.set(k, [...(porPersona.get(k) ?? []), t]);
    }
    const gente = equipo.personas
      .filter((p) => p.activo)
      .filter((p) =>
        seleccion ? [...seleccion].some((s) => ejecutaSector(ctx, p.id, s)) : (porPersona.get(p.id)?.length ?? 0) > 0 || ctx.ejecutaEn.get(p.id)?.size
      )
      // Con un hub elegido, en Diseño se ve solo su gente (los hubs agrupan diseñadores).
      .filter((p) => !hubActual || !seleccion?.has("diseno_digital") || !ejecutaSector(ctx, p.id, "diseno_digital") || p.hub_id === hubActual.id)
      .filter((p) => !q || fold(p.nombre).includes(q) || (porPersona.get(p.id) ?? []).some((t) => fold(t.titulo).includes(q) || fold(t.proyecto).includes(q)));
    // Primero vos, después quien tiene tareas (alfabético), al final quien no tiene nada. El orden no
    // cambia mientras se arrastra: así las filas no saltan.
    gente.sort(
      (a, b) =>
        Number(b.id === yo) - Number(a.id === yo) ||
        Number((porPersona.get(b.id)?.length ?? 0) > 0) - Number((porPersona.get(a.id)?.length ?? 0) > 0) ||
        a.nombre.localeCompare(b.nombre, "es")
    );
    const filtrar = (lista: TareaFlujo[]) => (q ? lista.filter((t) => fold(t.titulo).includes(q) || fold(t.proyecto).includes(q)) : lista);
    const sinNadie = filtrar(porPersona.get(NADIE) ?? []);
    return [
      ...(sinNadie.length ? [{ key: NADIE, persona: null, tareas: ordenarPorPrioridad(sinNadie) }] : []),
      ...gente.map((p) => ({ key: p.id, persona: p, tareas: conPausadasAlFinal(ordenarPorPrioridad(porPersona.get(p.id) ?? [])) })),
    ];
    // Las filas se arman de nuevo cuando cambian las tareas: el orden de las personas no depende de lo arrastrado.
  }, [ctx, equipo, tareas, seleccion, hubActual, buscar, yo]);

  const enValidacion = useMemo(() => filas.flatMap((f) => f.tareas).filter((t) => etapaDe(t) === "validacion").map((t) => t.id), [filas]);
  const claveValidacion = enValidacion.join(",");
  const recargarValidaciones = () => flujoRepo.validaciones(enValidacion).then(setValidaciones, () => undefined);
  useEffect(() => {
    recargarValidaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveValidacion]);

  function onSoltar(id: string, desde: string, hacia: Destino) {
    const t = tareas.find((x) => String(x.id) === id);
    const fila = filas.find((f) => f.key === hacia.lista);
    if (!t || !fila || !ctx || !fila.persona) return;
    const otras = fila.tareas.filter((x) => x.id !== t.id);
    const orden = ordenEntre(
      otras[hacia.indice - 1] ? claveOrden(otras[hacia.indice - 1]) : undefined,
      otras[hacia.indice] ? claveOrden(otras[hacia.indice]) : undefined
    );
    if (hacia.lista === desde) {
      cambiarTarea(t.id, { orden }, () => flujoRepo.ordenar(t.id, orden));
      return;
    }
    const etapa = etapaDe(t);
    if (etapa === "validacion") {
      toast("En Validación la tarea no es de una persona: la validan sus compañeros. Pasala de etapa primero.", "error");
      return;
    }
    // Pasársela al designado de esa etapa es devolvérsela (queda "del designado", no "tomada").
    const r = responsableDe(t, ctx);
    const designado = etapa !== "entrada" && r.sector ? designadoDe(ctx, t.brand_id, r.sector) : null;
    const persona = hacia.lista === designado?.id ? null : hacia.lista;
    cambiarTarea(t.id, { responsable_id: persona, orden }, () => flujoRepo.asignar(t.id, persona, orden), `Ahora la tiene ${fila.persona.nombre}`);
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
        forma="fila"
        {...extra}
      />
    );
  };

  const falta = sinEquipo ? "supabase/migracion-equipo.sql" : sinMigracion ? "supabase/migracion-flujo.sql" : null;
  const nombrePuestos = (p: Persona) => p.puestos.map((id) => equipo?.puestos.find((x) => x.id === id)?.nombre).filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen">
      <ContextBar>
        <BoardNav />
        <BarDivider />
        <BarSearch value={buscar} onChange={setBuscar} placeholder="Buscar persona, tarea o marca" />
      </ContextBar>

      <main className="px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">
          <div>
            <h1 className="font-display text-4xl leading-none tracking-[-0.01em]">Equipo</h1>
            <p className="mt-1 text-xs text-muted-foreground">Cada fila es una persona · a la izquierda, lo más prioritario</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[{ id: TODOS, nombre: "Todos" }, ...pestanas].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setElegido(s.id === miSector ? AUTO : s.id)}
                title={s.id === miSector ? "Tu sector" : undefined}
                aria-pressed={sectorActual === s.id}
                className={cn(
                  "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
                  sectorActual === s.id ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/30"
                )}
              >
                {s.nombre}
              </button>
            ))}
          </div>
          {equipo && equipo.hubs.length > 0 && (
            <div className="w-44">
              <SelectSimple value={hub} onChange={setHub} opciones={equipo.hubs.map((h) => ({ value: h.id, label: h.nombre }))} ninguno="Todos los hubs" />
            </div>
          )}
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
          <div className="space-y-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-40 rounded-3xl" />
            ))}
          </div>
        ) : !filas.length ? (
          <p className="rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground">
            {buscar ? "Nadie coincide con la búsqueda." : "Nadie trabaja tareas de este sector todavía. Cargá los puestos en Organización."}
          </p>
        ) : (
          <div className="space-y-7">
            {filas.map((f) => {
              const otras = f.tareas.filter((t) => String(t.id) !== arrastre?.id);
              const recibe = Boolean(f.persona);
              const aca = arrastre && recibe && destino?.lista === f.key;
              const carga = cargaDe(f.tareas);
              const esperando = f.tareas.filter((t) => tonoDe(t) === "esperando").length;
              let k = 0;
              return (
                <section key={f.key} className={cn(!f.tareas.length && "opacity-55")}>
                  <header className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {f.persona ? (
                      <Avatar nombre={f.persona.nombre} url={f.persona.avatar_url} className="h-8 w-8" />
                    ) : (
                      <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed text-xs text-muted-foreground">?</span>
                    )}
                    <span className="font-display text-xl leading-none">
                      {f.persona ? f.persona.nombre : "Sin asignar"}
                      {f.persona?.id === yo && <span className="ml-1.5 font-sans text-xs text-muted-foreground">vos</span>}
                    </span>
                    {f.persona ? (
                      <>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {carga.n} {carga.n === 1 ? "activa" : "activas"}
                          {esperando ? ` · ${esperando} esperando` : ""}
                        </span>
                        <span className="text-xs font-semibold" style={{ color: carga.color }}>
                          {carga.label}
                        </span>
                        {nombrePuestos(f.persona) && <span className="truncate text-xs text-muted-foreground">{nombrePuestos(f.persona)}</span>}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{f.tareas.length} sin nadie · arrastralas a una persona</span>
                    )}
                  </header>
                  <div
                    data-scroll-x
                    data-eje="x"
                    {...(recibe ? propsLista(f.key) : {})}
                    className={cn(
                      "-mx-1 flex min-h-[8.5rem] items-stretch gap-3 overflow-x-auto rounded-[1.4rem] px-1 pb-3 pt-1 transition-colors [mask-image:linear-gradient(to_right,transparent_0,black_20px,black_calc(100%-24px),transparent)]",
                      aca && "bg-primary/10"
                    )}
                  >
                    {f.tareas.map((t) => {
                      const esta = arrastre?.id === String(t.id);
                      const indicador = !esta && aca && destino?.indice === k ? <Indicador eje="x" /> : null;
                      if (!esta) k++;
                      return (
                        <Fragment key={t.id}>
                          {indicador}
                          {tarjeta(t, {
                            ...propsTarjeta(String(t.id), f.key),
                            modo: esta ? "origen" : "normal",
                            onClick: () => setAbierta(t.id),
                            onKeyDown: (e) => e.key === "Enter" && setAbierta(t.id),
                          })}
                        </Fragment>
                      );
                    })}
                    {aca && destino?.indice === otras.length && <Indicador eje="x" />}
                    {!f.tareas.length && (
                      <p className="self-center px-2 text-sm text-muted-foreground">{arrastre ? "Soltá acá para pasársela" : "Sin tareas"}</p>
                    )}
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
            {tarjeta(arrastrada, { modo: "fantasma", forma: "columna" })}
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

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-primary/20 p-4 text-center text-sm">{children}</p>;
}
