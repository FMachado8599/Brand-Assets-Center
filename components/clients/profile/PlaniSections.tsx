"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, Plus } from "lucide-react";
import { BasecampMark, EtapaChip, Personas } from "@/components/plani/BasecampTarea";
import { EstadoPill, FormatDot } from "@/components/plani/bits";
import { NuevaPlaniDialog, type NuevaPlaniInicial } from "@/components/plani/NuevaPlaniDialog";
import { useIntegraciones } from "@/hooks/useIntegraciones";
import { useTipos } from "@/hooks/useTipos";
import { basecampRepo, mesDelTitulo, type TareaCompleta } from "@/lib/plani/basecamp";
import { tipoDeTitulo } from "@/lib/plani/tipos";
import { FORMATO_ORDEN, MESES } from "@/lib/plani/config";
import { aDate } from "@/lib/plani/fechas";
import { planiRepo } from "@/lib/plani/repo";
import type { PlaniResumen } from "@/lib/plani/types";
import type { Brand } from "@/lib/types";
import { TipoChip } from "@/components/plani/TipoChip";
import { Empty, Section, SmallAction } from "./Section";

/** Las presentaciones del cliente, la más nueva arriba, con su tipo. */
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
  const { tipoDe } = useTipos();
  return (
    <Section
      id="planis"
      title="Presentaciones"
      hint="Planificaciones, ads, programática… de cada mes."
      action={
        <SmallAction onClick={() => onNueva({ brandId: brand.id })}>
          <Plus /> Nueva
        </SmallAction>
      }
    >
      {planis === null ? (
        <span className="skeleton block h-16 rounded-2xl" />
      ) : falta ? (
        <Empty>Falta correr supabase/migracion-presentaciones.sql en Supabase.</Empty>
      ) : !planis.length ? (
        <Empty>Todavía no tiene presentaciones.</Empty>
      ) : (
        <ul className="divide-y divide-black/[0.06]">
          {planis.slice(0, 8).map((p) => (
            <li key={p.id}>
              <Link href={`/presentaciones/${p.id}`} className="group flex items-center gap-3 py-2.5">
                <span className="w-24 shrink-0 font-display text-2xl leading-none">
                  {MESES[p.mes - 1].slice(0, 3)} <span className="text-base text-muted-foreground">{p.anio}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TipoChip tipo={tipoDe(p.tipo)} className="h-5 px-2 text-[10.5px]" /> {p.presentacion_piezas.length} piezas
                  </span>
                  <span className="mt-1 flex gap-1">
                    {FORMATO_ORDEN.flatMap((f) => p.presentacion_piezas.filter((x) => x.formato === f).map((x) => <FormatDot key={x.id} formato={f} className="h-2 w-2" />)).slice(0, 24)}
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
  const { hayBasecamp, loaded, data } = useIntegraciones();
  const { tipos } = useTipos();
  const [tareas, setTareas] = useState<TareaCompleta[] | null>(null);
  const [proyectos, setProyectos] = useState<{ id: number; nombre: string; app_url: string | null }[]>([]);

  useEffect(() => {
    if (!hayBasecamp) return;
    let vivo = true;
    Promise.all([basecampRepo.tareasDeCliente(brand.id, 60), basecampRepo.proyectos()]).then(([t, p]) => {
      if (!vivo) return;
      setTareas(t.data);
      setProyectos(((p.data ?? []) as { id: number; nombre: string; app_url: string | null; brand_id: string | null }[]).filter((x) => x.brand_id === brand.id));
    });
    return () => {
      vivo = false;
    };
  }, [hayBasecamp, brand.id]);

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
      {!hayBasecamp ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">
            Con Basecamp conectado, acá se ven las tareas del cliente (con su brief y su gente). Lo conecta un admin en Ajustes → Basecamp.
          </p>
        </div>
      ) : tareas === null ? (
        <span className="skeleton block h-16 rounded-2xl" />
      ) : !proyectos.length ? (
        <Empty>Este cliente no está vinculado a ningún proyecto de Basecamp.</Empty>
      ) : !tareas.length ? (
        <Empty>No tiene tareas abiertas.</Empty>
      ) : (
        <ul className="max-h-[26rem] space-y-1 overflow-y-auto pr-1">
          {tareas.map((t) => {
            const tipo = tipoDeTitulo(t.titulo, tipos);
            return (
            <li key={t.id} className="rounded-xl px-2 py-2 transition-colors hover:bg-secondary/60">
              <div className="flex items-start gap-2">
                <a href={t.app_url ?? undefined} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 text-sm font-medium leading-snug hover:underline">
                  {t.titulo}
                </a>
                {tipo && !vinculadas.has(Number(t.id)) && (
                  <button
                    type="button"
                    onClick={() => onNueva({ brandId: brand.id, tarea: t, tipo: tipo.id, mes: mesDelTitulo(t.titulo) ?? undefined })}
                    title={`Crear la presentación: ${tipo.nombre}`}
                    className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-white"
                    style={{ background: tipo.color }}
                  >
                    <Plus className="h-3 w-3" /> {tipo.nombre}
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
            );
          })}
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
