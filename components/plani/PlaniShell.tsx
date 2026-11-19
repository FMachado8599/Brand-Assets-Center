"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Loader2, Plug, Plus } from "lucide-react";
import { MissingConfig } from "@/components/board/MissingConfig";
import { ClientMark } from "@/components/clients/ClientMark";
import { BarAction, BarButton, BarDivider, BarPopover, BarSearch, ContextBar, PanelTitle } from "@/components/shell/ContextBar";
import { useBasecampSync } from "@/hooks/useBasecampSync";
import { useClients } from "@/hooks/useClients";
import { useEquipo } from "@/hooks/useEquipo";
import { useIntegraciones } from "@/hooks/useIntegraciones";
import { useOAuthResult } from "@/hooks/useOAuthResult";
import { useTipos } from "@/hooks/useTipos";
import { basecampRepo, periodoDelTitulo, type TareaCompleta } from "@/lib/plani/basecamp";
import { ESTADOS, FORMATOS, FORMATO_ORDEN, MESES } from "@/lib/plani/config";
import { tipoDeTitulo, type TipoPresentacion } from "@/lib/plani/tipos";
import { planiErrorMessage, planiRepo } from "@/lib/plani/repo";
import type { PlaniEstado, PlaniResumen } from "@/lib/plani/types";
import { fold } from "@/lib/redaccion/text";
import { hasSupabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BasecampMark, EtapaChip, Personas } from "./BasecampTarea";
import { FormatDot, medioUrl } from "./bits";
import { ConexionesPanel } from "./Conexiones";
import { NuevaPlaniDialog, type NuevaPlaniInicial } from "./NuevaPlaniDialog";
import { RevealTitle } from "./Reveal";
import { TipoChip } from "./TipoChip";

const TODOS = "";

function hoyMes() {
  const d = new Date();
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
}

/**
 * Presentaciones: las del mes, en columnas por etapa (de redacción a lista), de todos los tipos o
 * del que se elija. Abajo, lo que falta arrancar: las tareas de Basecamp que se reconocen como de
 * algún tipo (por las palabras de su título) y todavía no tienen presentación.
 */
export function PlaniShell() {
  const { clients } = useClients();
  const { hayBasecamp, data: integraciones } = useIntegraciones();
  const { admin } = useEquipo();
  const sync = useBasecampSync({ auto: true });
  const [planis, setPlanis] = useState<PlaniResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [{ anio, mes }, setMes] = useState(hoyMes);
  const [query, setQuery] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string>(TODOS);
  const { tipos, tipoDe } = useTipos();
  const [nueva, setNueva] = useState<NuevaPlaniInicial | null>(null);
  const [sugeridas, setSugeridas] = useState<TareaCompleta[] | null>(null);
  const [brandsPorProyecto, setBrandsPorProyecto] = useState<Map<number, string>>(new Map());

  useOAuthResult();

  const cargar = useCallback(async () => {
    const { data, error } = await planiRepo.list();
    if (error) setError(planiErrorMessage(error));
    else {
      setError(null);
      setPlanis(data ?? []);
    }
  }, []);

  useEffect(() => {
    cargar();
    window.addEventListener("focus", cargar);
    return () => window.removeEventListener("focus", cargar);
  }, [cargar]);

  // Las tareas de Basecamp que se reconocen como de algún tipo y no tienen presentación todavía.
  useEffect(() => {
    if (!hayBasecamp || !planis || sync.corriendo || !tipos.length) return;
    const vinculadas = new Set(planis.map((p) => p.bc_tarea_id).filter((x): x is number => x != null));
    let vivo = true;
    Promise.all([basecampRepo.sinPresentacion(vinculadas, tipos), basecampRepo.proyectos()]).then(([t, p]) => {
      if (!vivo) return;
      setSugeridas(t.data);
      setBrandsPorProyecto(new Map(((p.data ?? []) as { id: number; brand_id: string | null }[]).filter((x) => x.brand_id).map((x) => [Number(x.id), x.brand_id!])));
    });
    return () => {
      vivo = false;
    };
  }, [hayBasecamp, planis, sync.corriendo, tipos]);

  const porCliente = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const q = fold(query.trim());
  // Las del mes, y las de meses anteriores que todavía no están listas (siguen en curso).
  const entra = useCallback(
    (p: { anio: number; mes: number; estado: string }) =>
      (p.anio === anio && p.mes === mes) || (p.anio * 12 + p.mes < anio * 12 + mes && p.estado !== "lista"),
    [anio, mes]
  );
  const delMes = useMemo(
    () =>
      (planis ?? [])
        .filter(entra)
        .filter((p) => !tipoFiltro || p.tipo === tipoFiltro)
        .filter((p) => !q || fold(porCliente.get(p.brand_id)?.name ?? "").includes(q))
        .sort((a, b) => (porCliente.get(a.brand_id)?.name ?? "").localeCompare(porCliente.get(b.brand_id)?.name ?? "", "es")),
    [planis, entra, q, porCliente, tipoFiltro]
  );

  // Lo que falta arrancar, con su tipo (y del tipo elegido arriba, si hay uno).
  const paraArrancar = useMemo(
    () =>
      (sugeridas ?? [])
        .map((t) => ({ tarea: t, tipo: tipoDeTitulo(t.titulo, tipos) }))
        .filter((x): x is { tarea: TareaCompleta; tipo: TipoPresentacion } => !!x.tipo && (!tipoFiltro || x.tipo.id === tipoFiltro)),
    [sugeridas, tipos, tipoFiltro]
  );
  // Cuántas hay de cada tipo este mes (para los chips del filtro).
  const delMesPorTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of planis ?? []) if (entra(p)) m.set(p.tipo, (m.get(p.tipo) ?? 0) + 1);
    return m;
  }, [planis, entra]);

  const mover = (d: number) =>
    setMes(({ anio, mes }) => {
      const m = mes + d;
      return m < 1 ? { anio: anio - 1, mes: 12 } : m > 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: m };
    });

  if (!hasSupabase) return <MissingConfig />;

  const conexionesPendientes = integraciones && admin ? Number(!integraciones.basecamp) + Number(!integraciones.google) : 0;

  return (
    <>
      <ContextBar>
        <BarButton label="Mes anterior" icon={ChevronLeft} onClick={() => mover(-1)} />
        <span className="w-[6.5rem] shrink-0 text-center text-sm font-semibold text-cream">
          {MESES[mes - 1].slice(0, 3)} {anio}
        </span>
        <BarButton label="Mes siguiente" icon={ChevronRight} onClick={() => mover(1)} />
        <BarDivider />
        <BarSearch value={query} onChange={setQuery} placeholder="Buscar cliente…" busy={sync.corriendo} />
        <BarDivider />
        <BarPopover
          label="Basecamp y Drive"
          glyph={sync.corriendo ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Plug className="h-[18px] w-[18px]" />}
          badge={conexionesPendientes || undefined}
          align="end"
          className="w-80"
        >
          <PanelTitle title="Conexiones del estudio" hint="Una sola para todos: las conecta un admin." />
          <ConexionesPanel />
        </BarPopover>
        <BarAction label="Nueva presentación" icon={Plus} onClick={() => setNueva({ anio, mes })} />
      </ContextBar>

      <main className="mx-auto max-w-[96rem] px-4 pb-20 pt-24 sm:px-6 md:pt-28">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-8">
          <div>
            <p className="site-label text-ink/50">
              Presentaciones <span className="text-primary">\</span> {delMes.length} {delMes.length === 1 ? "presentación" : "presentaciones"}
            </p>
            <RevealTitle className="mt-4 font-display text-[clamp(3.2rem,10vw,7rem)] leading-[0.86] tracking-[-0.025em]" deps={[anio, mes]}>
              {MESES[mes - 1]} <em className="text-ink/25">{anio}</em>
            </RevealTitle>
          </div>
          {anio !== hoyMes().anio || mes !== hoyMes().mes ? (
            <button type="button" onClick={() => setMes(hoyMes())} className="mb-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Volver a este mes
            </button>
          ) : null}
        </header>

        {tipos.length > 0 && (
          <div className="-mt-2 mb-6 flex flex-wrap items-center gap-1.5" role="group" aria-label="Tipo">
            <button
              type="button"
              onClick={() => setTipoFiltro(TODOS)}
              aria-pressed={!tipoFiltro}
              className={cn(
                "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
                !tipoFiltro ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/30"
              )}
            >
              Todas
            </button>
            {tipos.map((t) => {
              const activo = tipoFiltro === t.id;
              const n = delMesPorTipo.get(t.id) ?? 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTipoFiltro(activo ? TODOS : t.id)}
                  aria-pressed={activo}
                  className={cn("rounded-full transition-opacity", !activo && tipoFiltro && "opacity-50 hover:opacity-100")}
                >
                  <TipoChip tipo={t} className={cn("h-8 px-3 text-[13px]", activo && "ring-2 ring-offset-1")} />
                  {n > 0 && <span className="sr-only">{n}</span>}
                </button>
              );
            })}
          </div>
        )}

        {error ? (
          <p className="rounded-2xl bg-primary/25 px-4 py-3 text-sm">{error}</p>
        ) : planis === null ? (
          <Tablero>
            {ESTADOS.map((e) => (
              <Columna key={e.value} estado={e.value} count={0}>
                <span className="skeleton block h-40 rounded-[1.25rem]" />
              </Columna>
            ))}
          </Tablero>
        ) : (
          <Tablero>
            {ESTADOS.map((e) => {
              const items = delMes.filter((p) => p.estado === e.value);
              return (
                <Columna key={e.value} estado={e.value} count={items.length}>
                  {items.map((p) => (
                    <PlaniCard
                      key={p.id}
                      plani={p}
                      brand={porCliente.get(p.brand_id) ?? null}
                      tipo={tipoDe(p.tipo)}
                      deOtroMes={p.anio !== anio || p.mes !== mes ? `${MESES[p.mes - 1]}${p.anio !== anio ? ` ${p.anio}` : ""}` : null}
                    />
                  ))}
                  {e.value === "redaccion" && (
                    <button
                      type="button"
                      onClick={() => setNueva({ anio, mes })}
                      className="flex h-20 w-full items-center justify-center gap-2 rounded-[1.25rem] border-2 border-dashed border-foreground/12 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" /> Nueva
                    </button>
                  )}
                </Columna>
              );
            })}
          </Tablero>
        )}

        {hayBasecamp && paraArrancar.length > 0 && (
          <section className="mt-14" aria-label="Para arrancar">
            <div className="mb-4 flex items-end gap-3 border-b border-foreground/15 pb-2">
              <h2 className="font-display text-[2.4rem] leading-none">Para arrancar</h2>
              <span className="flex items-center gap-1.5 pb-1 text-xs text-muted-foreground">
                <BasecampMark className="h-3.5 w-3.5" /> Tareas de Basecamp que se reconocen por su título y todavía no tienen presentación
              </span>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {paraArrancar.map(({ tarea: t, tipo }) => {
                const brandId = brandsPorProyecto.get(Number(t.proyecto_id)) ?? null;
                const brand = brandId ? porCliente.get(brandId) ?? null : null;
                return (
                  <li key={t.id} className="flex flex-col gap-3 rounded-[1.25rem] border border-black/[0.06] bg-card/90 p-4">
                    <div className="flex items-start gap-2.5">
                      {brand ? <ClientMark brand={brand} className="h-9 w-9 rounded-xl text-[10px]" pad="p-[14%]" /> : <BasecampMark className="mt-1 h-6 w-6" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] text-muted-foreground">{brand?.name ?? t.proyecto?.nombre}</span>
                        <span className="line-clamp-2 text-sm font-semibold leading-snug">{t.titulo}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TipoChip tipo={tipo} />
                      <EtapaChip tarea={t} />
                      <Personas personas={t.personas} max={3} />
                    </div>
                    <div className="mt-auto flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!brandId}
                        onClick={() => setNueva({ brandId, tarea: t, tipo: tipo.id, ...(periodoDelTitulo(t.titulo) ?? { anio, mes }) })}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:brightness-95 disabled:opacity-45"
                        title={brandId ? undefined : "Ese proyecto no está vinculado a ningún cliente"}
                      >
                        <Plus className="h-3.5 w-3.5" /> Crear la presentación
                      </button>
                      {t.app_url && (
                        <a href={t.app_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">
                          Ver en Basecamp <ArrowUpRight className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>

      <NuevaPlaniDialog open={nueva !== null} onOpenChange={(o) => !o && setNueva(null)} inicial={nueva ?? undefined} />
    </>
  );
}

function Tablero({ children }: { children: React.ReactNode }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 xl:grid xl:grid-cols-6 xl:overflow-visible">
      {children}
    </div>
  );
}

function Columna({ estado, count, children }: { estado: PlaniEstado; count: number; children: React.ReactNode }) {
  const e = ESTADOS.find((x) => x.value === estado)!;
  return (
    <section aria-label={e.label} className="flex w-[17rem] shrink-0 snap-start flex-col gap-2.5 xl:w-auto">
      <header className="flex items-center gap-2 border-b border-foreground/15 pb-2">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: e.color }} />
        <h2 className="text-sm font-semibold">{e.label}</h2>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{count || ""}</span>
      </header>
      {children}
    </section>
  );
}

function PlaniCard({ plani, brand, tipo, deOtroMes }: { plani: PlaniResumen; brand: Brand | null; tipo: TipoPresentacion; deOtroMes: string | null }) {
  const piezas = plani.presentacion_piezas ?? [];
  const total = piezas.length;
  const conMaterial = piezas.filter((p) => (p.medios ?? []).some((m) => m.rol === "final")).length;
  const programadas = piezas.filter((p) => p.programada).length;
  // Una tira con las últimas piezas del feed que ya tienen imagen.
  const feed = piezas
    .filter((p) => p.formato !== "historia")
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map((p) => (p.medios ?? []).find((m) => m.rol === (p.formato === "reel" ? "portada" : "final")) ?? (p.medios ?? []).find((m) => m.rol !== "referencia"))
    .filter(Boolean)
    .slice(0, 3);

  return (
    <Link
      href={`/presentaciones/${plani.id}`}
      className="group flex flex-col gap-3 rounded-[1.25rem] border border-black/[0.06] bg-card p-3.5 shadow-[0_1px_2px_hsl(40_30%_20%/0.04)] transition-[transform,box-shadow] duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_hsl(40_45%_20%/0.45)]"
    >
      <div className="flex items-center gap-2.5">
        {brand ? <ClientMark brand={brand} className="h-10 w-10 rounded-xl text-xs" pad="p-[14%]" /> : <span className="h-10 w-10 rounded-xl bg-secondary" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[1.45rem] leading-tight">{brand?.name ?? "Cliente"}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {total} {total === 1 ? "pieza" : "piezas"}
          </span>
        </span>
        {plani.bc_tarea_id && <BasecampMark className="h-3.5 w-3.5 opacity-70" />}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <TipoChip tipo={tipo} />
        {deOtroMes && (
          <span className="rounded-full bg-[#8A6A3B]/12 px-2 py-0.5 text-[11px] font-medium text-[#8A6A3B]" title="De un mes anterior que todavía no está lista">
            {deOtroMes}
          </span>
        )}
      </div>

      {feed.length > 0 ? (
        <div className="grid grid-cols-3 gap-[2px] overflow-hidden rounded-lg">
          {feed.map((m) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m!.id} src={medioUrl(m!, 240)} alt="" className="aspect-[3/4] w-full bg-secondary object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
          ))}
        </div>
      ) : total > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {FORMATO_ORDEN.map((f) => {
            const n = piezas.filter((p) => p.formato === f).length;
            return n ? (
              <span key={f} className="inline-flex items-center gap-1">
                <FormatDot formato={f} className="h-2 w-2" /> {n} {n === 1 ? FORMATOS[f].label.toLowerCase() : FORMATOS[f].plural.toLowerCase()}
              </span>
            ) : null;
          })}
        </div>
      ) : (
        <p className="text-[11px] italic text-muted-foreground">Sin piezas todavía</p>
      )}

      {total > 0 && (
        <div className="space-y-1">
          <Barra valor={conMaterial} total={total} label="material" />
          {programadas > 0 && <Barra valor={programadas} total={total} label="programadas" className="bg-emerald-700" />}
        </div>
      )}
    </Link>
  );
}

function Barra({ valor, total, label, className }: { valor: number; total: number; label: string; className?: string }) {
  return (
    <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
        <span className={cn("block h-full rounded-full bg-foreground", className)} style={{ width: `${(valor / Math.max(1, total)) * 100}%` }} />
      </span>
      <span className="w-[5.5rem] shrink-0 tabular-nums">
        {valor}/{total} {label}
      </span>
    </div>
  );
}
