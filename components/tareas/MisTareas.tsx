"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, MessageSquare, Pause } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { BarDivider, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { useClients } from "@/hooks/useClients";
import { useEquipo } from "@/hooks/useEquipo";
import { useFlujo } from "@/hooks/useFlujo";
import {
  armarContexto,
  ETAPA_LABEL,
  etapaDe,
  flujoRepo,
  ordenarPorPrioridad,
  responsableDe,
  validadoresDe,
  type Contexto,
  type Etapa,
  type TareaFlujo,
} from "@/lib/board/flujo";
import { tareasRepo, type PersonaBc } from "@/lib/board/tareas";
import { fold } from "@/lib/redaccion/text";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, BoardNav, hace } from "./comun";
import { fechaCorta } from "./TareaCard";
import { TareaDetalle } from "./TareaDetalle";

type Alcance = "meToca" | "basecamp" | "marcas";

const ORDEN_ETAPAS: Etapa[] = ["entrada", "redaccion", "diseno", "en_proceso", "validacion", "cliente", "implementacion", "finalizada"];
const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * Board → Mis tareas. "Me toca": lo que tengo en mi etapa (designado, tomada o pasada) y lo que me
 * toca validar. "En Basecamp": donde estoy asignado allá. "De mis marcas": todo lo de las marcas de
 * las que soy designado, en el tablero de mi sector.
 */
export function MisTareas() {
  const { data: equipo, error: errorEquipo, sinMigracion: sinEquipo, loaded: equipoListo } = useEquipo();
  const { tareas, loaded, error, sinMigracion } = useFlujo();
  const { clients } = useClients();
  const [alcance, setAlcance] = useState<Alcance>("meToca");
  const [buscar, setBuscar] = useState("");
  const [abierta, setAbierta] = useState<number | null>(null);
  const [validaciones, setValidaciones] = useState<Map<number, Set<string>>>(new Map());
  const [personasBc, setPersonasBc] = useState<Map<number, PersonaBc>>(new Map());
  const [ultima, setUltima] = useState<string | null>(null);

  useEffect(() => {
    tareasRepo.personas().then((lista) => setPersonasBc(new Map(lista.map((p) => [p.id, p]))), () => undefined);
    tareasRepo.ultimaSync().then(setUltima, () => undefined);
  }, []);

  const ctx: Contexto | null = useMemo(() => (equipo ? armarContexto(equipo) : null), [equipo]);
  const yo = equipo?.yo ?? null;
  const marcaPorId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const pares = useMemo(() => {
    if (!equipo || !yo?.equipo_id) return new Set<string>();
    const tableroDe = new Map(equipo.sectores.map((s) => [s.id, s.tablero]));
    return new Set(equipo.designaciones.filter((d) => d.persona_id === yo.equipo_id).map((d) => `${d.brand_id}|${tableroDe.get(d.sector_id) ?? "*"}`));
  }, [equipo, yo?.equipo_id]);

  // Las tres listas, para mostrar cuántas hay en cada una.
  const listas = useMemo(() => {
    const vacio = { meToca: [] as TareaFlujo[], basecamp: [] as TareaFlujo[], marcas: [] as TareaFlujo[] };
    if (!ctx || !yo) return vacio;
    for (const t of tareas) {
      const etapa = etapaDe(t);
      if (etapa === "finalizada") continue;
      if (yo.equipo_id) {
        const mia = responsableDe(t, ctx).persona?.id === yo.equipo_id;
        const valido = etapa === "validacion" && validadoresDe(t, ctx).some((p) => p.id === yo.equipo_id);
        if (mia || valido) vacio.meToca.push(t);
      }
      if (yo.bc_persona_id != null && t.asignados.includes(yo.bc_persona_id)) vacio.basecamp.push(t);
      if (t.brand_id && (pares.has(`${t.brand_id}|*`) || pares.has(`${t.brand_id}|${t.tablero}`))) vacio.marcas.push(t);
    }
    return vacio;
  }, [tareas, ctx, yo, pares]);

  const lista = listas[alcance];
  const claveValidacion = lista.filter((t) => etapaDe(t) === "validacion").map((t) => t.id).join(",");
  const recargarValidaciones = () =>
    flujoRepo.validaciones(lista.filter((t) => etapaDe(t) === "validacion").map((t) => t.id)).then(setValidaciones, () => undefined);
  useEffect(() => {
    recargarValidaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveValidacion]);

  const grupos = useMemo(() => {
    const q = fold(buscar).trim();
    const filtradas = lista.filter((t) => !q || fold(t.titulo).includes(q) || fold(t.proyecto).includes(q) || fold(t.tablero ?? "").includes(q));
    return ORDEN_ETAPAS.map((e) => ({
      etapa: e,
      tareas: (() => {
        const ordenadas = ordenarPorPrioridad(filtradas.filter((t) => etapaDe(t) === e));
        return [...ordenadas.filter((t) => !t.pausada), ...ordenadas.filter((t) => t.pausada)];
      })(),
    })).filter((g) => g.tareas.length);
  }, [lista, buscar]);

  const vencidas = lista.filter((t) => !t.pausada && t.vence && t.vence < hoy()).length;
  const abiertaTarea = abierta != null ? (tareas.find((t) => t.id === abierta) ?? null) : null;
  const falta = sinEquipo ? "supabase/migracion-equipo.sql" : sinMigracion ? "supabase/migracion-flujo.sql" : null;

  return (
    <div className="min-h-screen">
      <ContextBar>
        <BoardNav />
        <BarDivider />
        <BarSearch value={buscar} onChange={setBuscar} placeholder="Buscar una tarea o marca" />
      </ContextBar>

      <main className="mx-auto max-w-4xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-6 text-center">
          <h1 className="font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">Mis tareas</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            {yo?.nombre ? `${yo.nombre} · ` : ""}De Basecamp, sincronizado {hace(ultima)}.
          </p>
        </div>

        {falta ? (
          <Aviso>
            Falta correr <code className="rounded bg-ink/10 px-1 text-[12px]">{falta}</code> en Supabase.
          </Aviso>
        ) : error || errorEquipo ? (
          <Aviso>{error ?? errorEquipo}</Aviso>
        ) : !loaded || !equipoListo || !ctx ? (
          <div className="skeleton h-40 rounded-3xl" />
        ) : !yo ? (
          <Aviso>Tu cuenta no tiene acceso a las tareas del estudio.</Aviso>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
              {(
                [
                  { value: "meToca", label: "Me toca" },
                  { value: "basecamp", label: "En Basecamp" },
                  { value: "marcas", label: "De mis marcas" },
                ] as { value: Alcance; label: string }[]
              ).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setAlcance(o.value)}
                  aria-pressed={alcance === o.value}
                  className={cn(
                    "h-8 rounded-full border px-3 text-sm font-medium transition-colors",
                    alcance === o.value ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/30"
                  )}
                >
                  {o.label} <span className="tabular-nums opacity-60">{listas[o.value].length}</span>
                </button>
              ))}
              {vencidas > 0 && <span className="text-xs font-medium text-destructive">{vencidas} vencidas</span>}
            </div>

            {alcance === "meToca" && !yo.equipo_id ? (
              <Aviso>Todavía no estás en el equipo. Un admin te puede sumar desde Equipo (Traer gente nueva de Basecamp).</Aviso>
            ) : alcance === "basecamp" && yo.bc_persona_id == null ? (
              <Aviso>
                No encontramos tu usuario de Basecamp con tu mail ({yo.email}). Un admin te puede vincular desde{" "}
                <Link href="/board/equipo" className="font-medium underline">
                  Equipo
                </Link>
                .
              </Aviso>
            ) : alcance === "marcas" && !pares.size ? (
              <Aviso>
                Todavía no sos designado de ninguna marca. Elegí las tuyas en{" "}
                <Link href="/board/equipo" className="font-medium underline">
                  Equipo
                </Link>
                .
              </Aviso>
            ) : !grupos.length ? (
              <p className="rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground">
                {buscar ? "Ninguna tarea coincide con la búsqueda." : "No tenés tareas abiertas acá. 🎉"}
              </p>
            ) : (
              <div className="space-y-4">
                {grupos.map((g) => (
                  <section key={g.etapa} className="overflow-hidden rounded-3xl border bg-card shadow-sm">
                    <header className="flex items-center gap-2 border-b bg-secondary/40 px-4 py-2.5">
                      <h2 className="eyebrow flex-1 text-muted-foreground">{g.etapa === "validacion" && alcance === "meToca" ? "Para validar" : ETAPA_LABEL[g.etapa]}</h2>
                      <span className="text-xs tabular-nums text-muted-foreground">{g.tareas.length}</span>
                    </header>
                    <ul className="divide-y">
                      {g.tareas.map((t) => (
                        <Fila
                          key={t.id}
                          tarea={t}
                          marca={t.brand_id ? (marcaPorId.get(t.brand_id) as Brand | undefined) : undefined}
                          ctx={ctx}
                          personasBc={personasBc}
                          yoBc={yo.bc_persona_id}
                          onAbrir={() => setAbierta(t.id)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </main>

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

function Fila({
  tarea: t,
  marca,
  ctx,
  personasBc,
  yoBc,
  onAbrir,
}: {
  tarea: TareaFlujo;
  marca?: Brand;
  ctx: Contexto;
  personasBc: Map<number, PersonaBc>;
  yoBc: number | null;
  onAbrir: () => void;
}) {
  const resp = responsableDe(t, ctx);
  const otros = t.asignados.filter((id) => id !== yoBc).map((id) => personasBc.get(id)).filter(Boolean) as PersonaBc[];
  const tarde = !t.pausada && Boolean(t.vence && t.vence < hoy());
  return (
    <li>
      <button type="button" onClick={onAbrir} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40">
        <ClientMark brand={marca ?? { name: t.proyecto, color: "#52525B", logo_url: null, logo_bg: "light" }} className="h-9 w-9 rounded-xl text-[11px]" />
        <div className="min-w-0 flex-1">
          <p className={cn("flex items-center gap-1.5 truncate font-medium", t.pausada && "text-muted-foreground")}>
            {t.pausada && <Pause className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{t.titulo || "Sin título"}</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {marca?.name ?? t.proyecto}
            {t.tablero ? ` · ${t.tablero}` : ""}
            {resp.persona ? ` · la tiene ${resp.persona.nombre}` : ""}
          </p>
        </div>
        {t.vence && (
          <span className={cn("hidden shrink-0 items-center gap-1 text-xs tabular-nums sm:inline-flex", tarde ? "font-medium text-destructive" : "text-muted-foreground")}>
            <CalendarDays className="h-3.5 w-3.5" />
            {fechaCorta(t.vence)}
          </span>
        )}
        {otros.length > 0 && (
          <span className="hidden shrink-0 -space-x-1.5 sm:flex">
            {otros.slice(0, 3).map((p) => (
              <Avatar key={p.id} nombre={p.nombre} url={p.avatar_url} className="h-6 w-6 ring-2 ring-card" />
            ))}
          </span>
        )}
        {t.comentarios > 0 && (
          <span className="hidden shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground md:inline-flex">
            <MessageSquare className="h-3.5 w-3.5" />
            {t.comentarios}
          </span>
        )}
      </button>
    </li>
  );
}
