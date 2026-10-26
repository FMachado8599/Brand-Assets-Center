"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { BarAction, BarButton, BarDivider, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { FilterSelect, type FilterOption } from "@/components/ui/filter-select";
import { Switch } from "@/components/ui/switch";
import { useClients } from "@/hooks/useClients";
import { useInfluencers } from "@/hooks/useInfluencers";
import { useInfluencity } from "@/hooks/useInfluencity";
import { anios, filtrar, PERIODOS, porPerfil, SIN_CLIENTE, totales, type Periodo, type Stats } from "@/lib/influencity/rendimiento";
import { corto, fechaCorta, nombreRed, porcentaje, type Perfil } from "@/lib/influencity/tipos";
import { fold, timeAgo } from "@/lib/redaccion/text";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AgregarInfluencerDialog } from "./AgregarInfluencerDialog";
import { ClienteChip, Encabezado, FaltaMigracion, Foto, InfluencersNav, NombrePerfil, Pildoras, SinConexion, Stat } from "./comun";

type Columna = "publicaciones" | "views" | "interacciones" | "engagement" | "seguidores" | "ultima";

const COLUMNAS: { id: Columna; label: string; corto: string; className?: string }[] = [
  { id: "publicaciones", label: "Publicaciones", corto: "Publ." },
  { id: "views", label: "Vistas", corto: "Vistas" },
  { id: "interacciones", label: "Interacciones", corto: "Interac.", className: "hidden sm:table-cell" },
  { id: "engagement", label: "Engagement promedio", corto: "Eng.", className: "hidden md:table-cell" },
  { id: "seguidores", label: "Seguidores", corto: "Seguid.", className: "hidden lg:table-cell" },
  { id: "ultima", label: "Última publicación", corto: "Última", className: "hidden lg:table-cell" },
];

type Fila = { perfil: Perfil; stats: Stats | null; clientes: string[] };

function valor(f: Fila, c: Columna): number {
  if (c === "seguidores") return f.perfil.seguidores ?? -1;
  if (c === "ultima") return f.stats?.ultima ? new Date(f.stats.ultima).getTime() : -1;
  if (c === "engagement") return f.stats?.engagement ?? -1;
  return f.stats?.[c] ?? -1;
}

const PAGINA = 60;

/**
 * El tablero de Influencers: quién trabajó, para qué clientes y cómo rindió, con los filtros de
 * cliente, red y período. Los números salen de las campañas que mide Influencity.
 */
export function InfluencersView() {
  const { data, loaded, error, sinMigracion } = useInfluencers();
  const inf = useInfluencity({ auto: true });
  const { clients } = useClients();
  const [buscar, setBuscar] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [clientesSel, setClientesSel] = useState<string[]>([]);
  const [redesSel, setRedesSel] = useState<string[]>([]);
  const [conCuentas, setConCuentas] = useState(false);
  const [orden, setOrden] = useState<{ col: Columna; desc: boolean }>({ col: "views", desc: true });
  const [mostrar, setMostrar] = useState(PAGINA);
  const [agregar, setAgregar] = useState(false);

  // Desde la ficha de un cliente: /influencers?cliente=<id>
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("cliente");
    if (c) setClientesSel([c]);
  }, []);

  const clientePorId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const vista = useMemo(() => {
    if (!data) return null;
    const perfiles = new Map(data.perfiles.map((p) => [p.id, p]));
    const cuentas = new Set(data.perfiles.filter((p) => p.cuenta_de).map((p) => p.id));
    const filas = filtrar(data.rendimiento, { periodo, clientes: clientesSel, redes: redesSel }).filter((r) => conCuentas || !cuentas.has(r.perfil_id));
    const stats = porPerfil(filas);

    // "Trabajó con" cargado a mano también cuenta, aunque Influencity no lo haya medido.
    const aMano = new Map<string, string[]>();
    for (const v of data.vinculos) {
      if (v.tipo !== "cliente" || !v.brand_id) continue;
      aMano.set(v.perfil_id, [...(aMano.get(v.perfil_id) ?? []), v.brand_id]);
    }

    const ids = new Set(stats.keys());
    if (periodo === "todo" && !redesSel.length) {
      for (const [id, marcas] of aMano) if (!clientesSel.length || marcas.some((m) => clientesSel.includes(m))) ids.add(id);
      if (!clientesSel.length) for (const p of data.perfiles) ids.add(p.id);
    }

    const q = fold(buscar).trim();
    const lista: Fila[] = [];
    for (const id of ids) {
      const perfil = perfiles.get(id);
      if (!perfil || (!conCuentas && perfil.cuenta_de)) continue;
      if (q && !fold(`${perfil.nombre ?? ""} ${perfil.usuario}`).includes(q)) continue;
      const s = stats.get(id) ?? null;
      lista.push({ perfil, stats: s, clientes: [...new Set([...(s?.clientes ?? []), ...(aMano.get(id) ?? [])])] });
    }
    lista.sort((a, b) => (valor(b, orden.col) - valor(a, orden.col)) * (orden.desc ? 1 : -1) || a.perfil.usuario.localeCompare(b.perfil.usuario));

    // Opciones de los filtros: los clientes y redes que tienen algo.
    const conDatos = new Set<string>();
    let sinCliente = false;
    for (const r of data.rendimiento) {
      if (r.brand_id) conDatos.add(r.brand_id);
      else sinCliente = true;
    }
    for (const marcas of aMano.values()) marcas.forEach((m) => conDatos.add(m));
    const opcionesClientes: FilterOption[] = [
      ...[...conDatos]
        .map((id) => clientePorId.get(id))
        .filter((c): c is Brand => Boolean(c))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ value: c.id, label: c.name, color: c.color })),
      ...(sinCliente ? [{ value: SIN_CLIENTE, label: "Sin cliente" }] : []),
    ];
    const opcionesRedes: FilterOption[] = [...new Set(data.perfiles.map((p) => p.red))].sort().map((r) => ({ value: r, label: nombreRed(r) }));
    const periodos = [...PERIODOS, ...anios(data.rendimiento).map((a) => ({ value: `a${a}` as Periodo, label: a }))];

    return { lista, total: totales(filas), opcionesClientes, opcionesRedes, periodos, cuentas: cuentas.size };
  }, [data, periodo, clientesSel, redesSel, conCuentas, buscar, orden, clientePorId]);

  const ordenarPor = (col: Columna) => setOrden((o) => (o.col === col ? { col, desc: !o.desc } : { col, desc: true }));
  const estado = inf.data?.sync;

  return (
    <div className="min-h-screen">
      <ContextBar>
        <InfluencersNav />
        <BarDivider />
        <BarSearch value={buscar} onChange={setBuscar} placeholder="Buscar un influencer" className="w-[clamp(7rem,16vw,12rem)]" />
        {inf.conectada && (
          <>
            <BarDivider />
            <BarButton
              label={inf.corriendo ? `Sincronizando: ${inf.pasoNombre ?? ""}` : "Traer lo nuevo de Influencity"}
              icon={inf.corriendo ? Loader2 : RefreshCw}
              onClick={inf.sincronizar}
              disabled={inf.corriendo}
              className={cn(inf.corriendo && "[&>svg]:animate-spin")}
            />
            <BarAction label="Agregar influencer" icon={UserPlus} onClick={() => setAgregar(true)}>
              Agregar
            </BarAction>
          </>
        )}
      </ContextBar>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <Encabezado titulo="Influencers">Quiénes trabajaron con cada cliente y cómo rindieron, con las campañas que mide Influencity.</Encabezado>

        {sinMigracion || inf.sinMigracion ? (
          <FaltaMigracion className="mx-auto mb-6 max-w-2xl" />
        ) : inf.loaded && !inf.conectada ? (
          <SinConexion className="mx-auto mb-6 max-w-2xl" />
        ) : null}

        {inf.conectada && (
          <p className="mb-5 text-center text-xs text-muted-foreground" aria-live="polite">
            {inf.corriendo ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Trayendo de Influencity · {inf.pasoNombre}
                {inf.detalle ? ` · ${inf.detalle}` : "…"}
              </span>
            ) : estado?.ultimo ? (
              <>Al día con Influencity {timeAgo(estado.ultimo, Date.now())}</>
            ) : (
              "Todavía no se trajo nada de Influencity"
            )}
            {!inf.corriendo && estado?.ultimo_error && <span className="text-destructive"> · La última vez falló: {estado.ultimo_error}</span>}
          </p>
        )}

        {error && !sinMigracion ? (
          <p className="mx-auto max-w-md rounded-2xl border bg-card p-4 text-center text-sm text-destructive">{error}</p>
        ) : !loaded || !vista ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" aria-busy>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-3xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Pildoras<Periodo> label="Período" value={periodo} onChange={setPeriodo} options={vista.periodos} />
              <div className="flex flex-wrap items-center gap-2">
                <FilterSelect label="Clientes" options={vista.opcionesClientes} selected={clientesSel} onChange={setClientesSel} emptyHint="Todavía no hay clientes con datos" className="h-9 rounded-full" />
                <FilterSelect label="Redes" options={vista.opcionesRedes} selected={redesSel} onChange={setRedesSel} className="h-9 rounded-full" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Stat label="Influencers" value={corto(vista.lista.length)} sub={clientesSel.length ? "con esos clientes" : "en la lista"} />
              <Stat label="Publicaciones" value={corto(vista.total.publicaciones)} sub={vista.total.patrocinadas ? `${corto(vista.total.patrocinadas)} marcadas como publicidad` : "medidas"} />
              <Stat label="Vistas" value={corto(vista.total.views)} />
              <Stat label="Interacciones" value={corto(vista.total.interacciones)} sub="likes, comentarios, compartidos…" />
              <Stat label="Engagement" value={porcentaje(vista.total.engagement)} sub="promedio por publicación" />
              <Stat label="Alcance" value={corto(vista.total.alcance)} sub={vista.total.alcance ? "cuentas únicas" : "Influencity no lo tiene"} />
            </div>

            <section aria-label="Influencers" className="mt-6 overflow-hidden rounded-3xl border bg-card shadow-sm">
              {vista.lista.length === 0 ? (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  {data && data.perfiles.length === 0
                    ? inf.conectada
                      ? "Todavía no hay influencers. Se traen solos de las campañas de Influencity, o agregalos a mano."
                      : "Cuando Influencity esté conectado, acá aparecen los influencers de cada campaña."
                    : "Nadie con esos filtros."}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b bg-secondary/50 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="w-1/2 px-4 py-2.5 text-left font-medium sm:w-[38%] xl:w-[30%]">
                        Influencer
                      </th>
                      <th scope="col" className="hidden px-2 py-2.5 text-left font-medium xl:table-cell">
                        Clientes
                      </th>
                      {COLUMNAS.map((c) => (
                        <th
                          key={c.id}
                          scope="col"
                          aria-sort={orden.col === c.id ? (orden.desc ? "descending" : "ascending") : "none"}
                          className={cn("px-2 py-2.5 text-right font-medium last:pr-4", c.className)}
                        >
                          <button type="button" onClick={() => ordenarPor(c.id)} title={c.label} className={cn("inline-flex items-center gap-1 hover:text-foreground", orden.col === c.id && "text-foreground")}>
                            {c.corto}
                            {orden.col === c.id && (orden.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {vista.lista.slice(0, mostrar).map((f) => (
                      <tr key={f.perfil.id} className="transition-colors hover:bg-secondary/40">
                        <td className="max-w-0 px-4 py-2.5">
                          <Link href={`/influencers/${f.perfil.id}`} className="flex min-w-0 items-center gap-2.5 outline-none focus-visible:underline">
                            <Foto perfil={f.perfil} />
                            <NombrePerfil perfil={f.perfil} />
                          </Link>
                        </td>
                        <td className="hidden px-2 py-2.5 xl:table-cell">
                          <span className="flex max-w-[16rem] flex-wrap gap-1">
                            {f.clientes.slice(0, 3).map((id) => {
                              const c = clientePorId.get(id);
                              return c ? <ClienteChip key={id} brand={c} /> : null;
                            })}
                            {f.clientes.length > 3 && <span className="self-center text-xs text-muted-foreground">+{f.clientes.length - 3}</span>}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{f.stats ? corto(f.stats.publicaciones) : "–"}</td>
                        <td className="px-2 py-2.5 text-right font-medium tabular-nums">{f.stats?.views ? corto(f.stats.views) : "–"}</td>
                        <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">{f.stats?.interacciones ? corto(f.stats.interacciones) : "–"}</td>
                        <td className="hidden px-2 py-2.5 text-right tabular-nums md:table-cell">{porcentaje(f.stats?.engagement)}</td>
                        <td className="hidden px-2 py-2.5 text-right tabular-nums text-muted-foreground lg:table-cell">{corto(f.perfil.seguidores)}</td>
                        <td className="hidden whitespace-nowrap px-2 py-2.5 pr-4 text-right text-xs text-muted-foreground lg:table-cell">{fechaCorta(f.stats?.ultima)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {vista.lista.length > mostrar && (
                <div className="border-t p-3 text-center">
                  <button type="button" onClick={() => setMostrar((m) => m + PAGINA)} className="text-sm font-medium text-muted-foreground hover:text-foreground">
                    Ver {Math.min(PAGINA, vista.lista.length - mostrar)} más de {vista.lista.length - mostrar}
                  </button>
                </div>
              )}
            </section>

            {vista.cuentas > 0 && (
              <label className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Switch checked={conCuentas} onCheckedChange={setConCuentas} aria-label="Incluir las cuentas de los clientes" />
                Incluir las cuentas de los clientes ({vista.cuentas})
              </label>
            )}
          </>
        )}
      </main>

      <AgregarInfluencerDialog open={agregar} onOpenChange={setAgregar} cliente={clientesSel.length === 1 && clientesSel[0] !== SIN_CLIENTE ? clientesSel[0] : null} />
    </div>
  );
}
