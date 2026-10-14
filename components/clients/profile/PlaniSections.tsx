"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, Plus } from "lucide-react";
import { BasecampMark, EtapaChip, Personas } from "@/components/plani/BasecampTarea";
import { EstadoPill, FormatDot } from "@/components/plani/bits";
import { NuevaPlaniDialog, type NuevaPlaniInicial } from "@/components/plani/NuevaPlaniDialog";
import { conectarUrl, useIntegraciones } from "@/hooks/useIntegraciones";
import { basecampRepo, mesDelTitulo, PARECE_PLANI, type TareaCompleta } from "@/lib/plani/basecamp";
import { FORMATO_ORDEN, MESES, TIPOS } from "@/lib/plani/config";
import { aDate } from "@/lib/plani/fechas";
import { planiRepo } from "@/lib/plani/repo";
import type { PlaniResumen } from "@/lib/plani/types";
import type { Brand } from "@/lib/types";
import { Empty, Section, SmallAction } from "./Section";

/** Las planis del cliente, la más nueva arriba. */
export function PlanisSection({
  brand,
  planis,
  falta,
  onNueva,
}: {
  brand: Brand;
  planis: PlaniResumen[] | null;
  falta: boolean;
  onNueva: (inicial: NuevaPlaniInicial) => void;
}) {
  return (
    <Section
      id="planis"
      title="Planificaciones"
      hint="Las planis de contenido de cada mes."
      action={
        <SmallAction onClick={() => onNueva({ brandId: brand.id })}>
          <Plus /> Nueva plani
        </SmallAction>
      }
    >
      {planis === null ? (
        <span className="skeleton block h-16 rounded-2xl" />
      ) : falta ? (
        <Empty>Falta correr supabase/migracion-planificacion.sql en Supabase.</Empty>
      ) : !planis.length ? (
        <Empty>Todavía no tiene planis.</Empty>
      ) : (
        <ul className="divide-y divide-black/[0.06]">
          {planis.slice(0, 8).map((p) => (
            <li key={p.id}>
              <Link href={`/planificacion/${p.id}`} className="group flex items-center gap-3 py-2.5">
                <span className="w-24 shrink-0 font-display text-2xl leading-none">
                  {MESES[p.mes - 1].slice(0, 3)} <span className="text-base text-muted-foreground">{p.anio}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted-foreground">{TIPOS[p.tipo].label} · {p.plani_piezas.length} piezas</span>
                  <span className="mt-1 flex gap-1">
                    {FORMATO_ORDEN.flatMap((f) => p.plani_piezas.filter((x) => x.formato === f).map((x) => <FormatDot key={x.id} formato={f} className="h-2 w-2" />)).slice(0, 24)}
                  </span>
                </span>
                <EstadoPill estado={p.estado} />
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:rotate-45" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/**
 * Lo que el cliente tiene abierto en Basecamp: las tareas vivas de sus proyectos, con su etapa y
 * la gente asignada. Las que suenan a plani se pueden arrancar desde acá.
 */
export function BasecampSection({
  brand,
  vinculadas,
  onNueva,
}: {
  brand: Brand;
  /** Las tareas que ya tienen plani: no se ofrece crearla otra vez. */
  vinculadas: Set<number>;
  onNueva: (inicial: NuevaPlaniInicial) => void;
}) {
  const { basecampOk, loaded, data } = useIntegraciones();
  const [tareas, setTareas] = useState<TareaCompleta[] | null>(null);
  const [proyectos, setProyectos] = useState<{ id: number; nombre: string; app_url: string | null }[]>([]);

  useEffect(() => {
    if (!basecampOk) return;
    let vivo = true;
    Promise.all([basecampRepo.tareasDeCliente(brand.id, 60), basecampRepo.proyectos()]).then(([t, p]) => {
      if (!vivo) return;
      setTareas(t.data);
      setProyectos(((p.data ?? []) as { id: number; nombre: string; app_url: string | null; brand_id: string | null }[]).filter((x) => x.brand_id === brand.id));
    });
    return () => {
      vivo = false;
    };
  }, [basecampOk, brand.id]);

  if (!loaded || (data && !data.listo.basecamp)) return null;

  return (
    <Section
      id="basecamp"
      title="Basecamp"
      hint={proyectos.length ? `Proyecto${proyectos.length > 1 ? "s" : ""}: ${proyectos.map((p) => p.nombre).join(", ")}` : "Las tareas abiertas del cliente."}
      action={
        proyectos[0]?.app_url ? (
          <SmallAction href={proyectos[0].app_url}>
            <BasecampMark /> Abrir
          </SmallAction>
        ) : undefined
      }
    >
      {!basecampOk ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">Con Basecamp conectado, acá se ven las tareas del cliente (con su brief y su gente).</p>
          <a href={conectarUrl("basecamp")} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground">
            Conectar Basecamp
          </a>
        </div>
      ) : tareas === null ? (
        <span className="skeleton block h-16 rounded-2xl" />
      ) : !proyectos.length ? (
        <Empty>Este cliente no está vinculado a ningún proyecto de Basecamp.</Empty>
      ) : !tareas.length ? (
        <Empty>No tiene tareas abiertas.</Empty>
      ) : (
        <ul className="max-h-[26rem] space-y-1 overflow-y-auto pr-1">
          {tareas.map((t) => (
            <li key={t.id} className="rounded-xl px-2 py-2 transition-colors hover:bg-secondary/60">
              <div className="flex items-start gap-2">
                <a href={t.app_url ?? undefined} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 text-sm font-medium leading-snug hover:underline">
                  {t.titulo}
                </a>
                {PARECE_PLANI.test(t.titulo) && !vinculadas.has(Number(t.id)) && (
                  <button
                    type="button"
                    onClick={() => onNueva({ brandId: brand.id, tarea: t, mes: mesDelTitulo(t.titulo) ?? undefined })}
                    className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-primary px-2 text-[11px] font-semibold text-primary-foreground"
                  >
                    <Plus className="h-3 w-3" /> Plani
                  </button>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <EtapaChip tarea={t} />
                {t.vence && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CalendarClock className="h-3 w-3" /> {aDate(t.vence).toLocaleDateString("es-UY", { day: "numeric", month: "short" })}
                  </span>
                )}
                <Personas personas={t.personas} max={3} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Las dos secciones juntas, con el diálogo de nueva plani compartido. */
export function TrabajoDelMes({ brand }: { brand: Brand }) {
  const [nueva, setNueva] = useState<NuevaPlaniInicial | null>(null);
  const [planis, setPlanis] = useState<PlaniResumen[] | null>(null);
  const [falta, setFalta] = useState(false);

  useEffect(() => {
    let vivo = true;
    planiRepo.porCliente(brand.id).then(({ data, error }) => {
      if (!vivo) return;
      setFalta(Boolean(error));
      setPlanis(data ?? []);
    });
    return () => {
      vivo = false;
    };
  }, [brand.id]);

  const vinculadas = new Set((planis ?? []).map((p) => p.bc_tarea_id).filter((x): x is number => x != null).map(Number));

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <PlanisSection brand={brand} planis={planis} falta={falta} onNueva={setNueva} />
        <BasecampSection brand={brand} vinculadas={vinculadas} onNueva={setNueva} />
      </div>
      <NuevaPlaniDialog open={nueva !== null} onOpenChange={(o) => !o && setNueva(null)} inicial={nueva ?? undefined} />
    </>
  );
}
