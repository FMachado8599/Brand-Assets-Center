"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, BarChart3, FileDown, Table2, X } from "lucide-react";
import { PLATFORM_NAMES, PlatformIcon } from "@/components/downloads/PlatformIcon";
import { BarAction, BarButton, BarDivider, BarSegmented, ContextBar } from "@/components/shell/ContextBar";
import { toast } from "@/components/ui/toaster";
import { formatBytes } from "@/lib/converter/catalog";
import type { Platform } from "@/lib/downloads/types";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { BAR_COLOR, DailyChart, DailyTable, type Bucket } from "./DailyChart";

/** Una fila de descargas_registro_listado (supabase/migracion-descargas-registro.sql). */
type Fila = {
  id: number;
  creado: string;
  user_id: string | null;
  nombre: string | null;
  email: string | null;
  avatar_url: string | null;
  plataforma: Platform;
  posteo_id: string;
  posteo_url: string;
  titulo: string | null;
  autor: string | null;
  tipo: "video" | "foto" | "portada" | "audio";
  numero: number | null;
  calidad: number | null;
  audio: "con" | "sin" | null;
  destino: "compu" | "ambos" | "drive";
  bytes: number | null;
  desde_oficina: boolean | null;
};

type Periodo = "7" | "30" | "90" | "todo";

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
  { value: "todo", label: "Todo" },
];

const PLATFORMS: Platform[] = ["youtube", "instagram", "pinterest"];
const TIPOS: Record<Fila["tipo"], string> = { video: "Videos", foto: "Fotos", portada: "Portadas", audio: "Solo audio" };
const TIPO_UNO: Record<Fila["tipo"], string> = { video: "Video", foto: "Foto", portada: "Portada", audio: "Audio" };
const DESTINOS: Record<Fila["destino"], string> = { compu: "A la compu", drive: "A Drive", ambos: "Compu y Drive" };
const SIN_CUENTA = "sin-cuenta";

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-AR", opts);
const LARGA = fmt({ weekday: "long", day: "numeric", month: "long" });
const CORTA = fmt({ day: "numeric", month: "short" });
const CON_DIA = fmt({ weekday: "short", day: "numeric" });
const CUANDO = fmt({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function desdeDe(p: Periodo) {
  if (p === "todo") return null;
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - (Number(p) - 1));
  return d;
}

/** Todo el período, de a 1000 filas (lo que devuelve la API por pedido). */
async function cargar(desde: Date | null): Promise<Fila[]> {
  const filas: Fila[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .rpc("descargas_registro_listado", { p_desde: desde?.toISOString() ?? null })
      .range(from, from + 999);
    if (error) throw error;
    const page = (data ?? []) as Fila[];
    filas.push(...page);
    if (page.length < 1000) return filas;
  }
}

const personaDe = (f: Fila) => f.user_id ?? SIN_CUENTA;
const nombreDe = (f: Pick<Fila, "nombre" | "email" | "user_id">) => f.nombre || f.email || (f.user_id ? "Sin nombre" : "Cuenta borrada");

/** Por día; si el período es largo (más de 120 días), por semana (de lunes a domingo). */
function buckets(filas: Fila[], desde: Date | null): Bucket[] {
  const hoy = startOfDay(new Date());
  const primero = desde ?? (filas.length ? startOfDay(new Date(filas[filas.length - 1].creado)) : hoy);
  const dias = Math.round((hoy.getTime() - primero.getTime()) / 86_400_000) + 1;
  const semanal = dias > 120;
  const inicio = (d: Date) => {
    const s = startOfDay(d);
    if (semanal) s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
    return s;
  };
  const lista: Bucket[] = [];
  const porClave = new Map<string, Bucket>();
  for (let d = inicio(primero); d <= hoy; d.setDate(d.getDate() + (semanal ? 7 : 1))) {
    const b: Bucket = {
      key: dayKey(d),
      label: semanal ? `semana del ${CORTA.format(d)}` : LARGA.format(d),
      short: !semanal && dias <= 8 ? CON_DIA.format(d) : CORTA.format(d),
      total: 0,
      porPlataforma: { youtube: 0, instagram: 0, pinterest: 0 },
    };
    lista.push(b);
    porClave.set(b.key, b);
  }
  for (const f of filas) {
    const b = porClave.get(dayKey(inicio(new Date(f.creado))));
    if (!b) continue;
    b.total++;
    b.porPlataforma[f.plataforma]++;
  }
  return lista;
}

function contar<K extends string>(filas: Fila[], key: (f: Fila) => K) {
  const m = new Map<K, number>();
  for (const f of filas) m.set(key(f), (m.get(key(f)) ?? 0) + 1);
  return m;
}

/** "1080p", "(3)", "sin audio": lo que distingue una descarga dentro de su tipo. */
function detalle(f: Fila) {
  return [f.numero && `n.º ${f.numero}`, f.calidad && `${f.calidad}p`, f.audio === "sin" && "sin audio"].filter(Boolean).join(" · ");
}

function desdeTexto(v: boolean | null) {
  return v === true ? "Oficina" : v === false ? "Afuera" : "–";
}

/* ───────────── CSV ───────────── */

function exportar(filas: Fila[], periodo: Periodo) {
  // Punto y coma y BOM: así Excel en español lo abre en columnas y con los acentos bien.
  const cols: [string, (f: Fila) => string | number | null][] = [
    ["fecha", (f) => new Date(f.creado).toLocaleString("sv-SE").replace(" ", "T")],
    ["persona", (f) => nombreDe(f)],
    ["email", (f) => f.email],
    ["plataforma", (f) => PLATFORM_NAMES[f.plataforma]],
    ["tipo", (f) => TIPO_UNO[f.tipo]],
    ["numero", (f) => f.numero],
    ["calidad", (f) => f.calidad],
    ["audio", (f) => f.audio],
    ["destino", (f) => DESTINOS[f.destino]],
    ["bytes", (f) => f.bytes],
    ["desde", (f) => desdeTexto(f.desde_oficina).replace("–", "")],
    ["titulo", (f) => f.titulo],
    ["autor", (f) => f.autor],
    ["link", (f) => f.posteo_url],
  ];
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.map(([c]) => c).join(";"), ...filas.map((f) => cols.map(([, get]) => cell(get(f))).join(";"))].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `descargas-${periodo === "todo" ? "todo" : `${periodo}-dias`}-${dayKey(new Date())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

/* ───────────── Piezas ───────────── */

function Avatar({ fila, className }: { fila: Pick<Fila, "avatar_url" | "nombre" | "email" | "user_id">; className?: string }) {
  const [roto, setRoto] = useState(false);
  const iniciales = nombreDe(fila)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return fila.avatar_url && !roto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fila.avatar_url}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setRoto(true)}
      className={cn("h-7 w-7 shrink-0 rounded-full object-cover", className)}
    />
  ) : (
    <span aria-hidden className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold", className)}>
      {iniciales || "?"}
    </span>
  );
}

function Card({ title, hint, action, children, className }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border bg-card p-5 shadow-sm", className)} aria-label={title}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-3xl border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold leading-none tracking-tight">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Filas con su número y una barra proporcional (una sola serie: un solo color). */
function BarList({
  items,
  onPick,
  picked,
}: {
  items: { key: string; label: ReactNode; name: string; value: number }[];
  onPick?: (key: string) => void;
  picked?: string | null;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((n, i) => n + i.value, 0);
  return (
    <ul className="space-y-2.5">
      {items.map((i) => {
        const body = (
          <>
            <span className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">{i.label}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-medium">{i.value.toLocaleString("es-AR")}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{total ? Math.round((i.value / total) * 100) : 0}%</span>
              </span>
            </span>
            <span aria-hidden className="mt-1 block h-1.5 overflow-hidden rounded-full bg-secondary">
              <span className="block h-full rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: BAR_COLOR }} />
            </span>
          </>
        );
        return (
          <li key={i.key}>
            {onPick ? (
              <button
                type="button"
                onClick={() => onPick(i.key)}
                aria-pressed={picked === i.key}
                aria-label={`${i.name}: ${i.value}. ${picked === i.key ? "Quitar el filtro" : "Ver solo esto"}`}
                className={cn(
                  "-mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1 text-left transition-colors hover:bg-secondary/60",
                  picked === i.key && "bg-secondary"
                )}
              >
                {body}
              </button>
            ) : (
              <div className="py-1">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────── La página ───────────── */

export function DownloadMetrics() {
  const router = useRouter();
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Con su fila: el chip sigue mostrando el nombre aunque en otro período no tenga descargas.
  const [persona, setPersona] = useState<{ key: string; fila: Fila } | null>(null);
  const [plataforma, setPlataforma] = useState<Platform | null>(null);
  const [vistaTabla, setVistaTabla] = useState(false);
  const [recientes, setRecientes] = useState(50);

  const desde = useMemo(() => desdeDe(periodo), [periodo]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    cargar(desde)
      .then((f) => vivo && (setFilas(f), setError(null)))
      .catch((err: { code?: string; message?: string }) => {
        if (!vivo) return;
        setError(
          err.code === "42501"
            ? "Tu cuenta no puede ver el registro de descargas."
            : `No se pudo leer el registro (${err.message ?? "error"}). Probá de nuevo.`
        );
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [desde]);

  const visibles = useMemo(
    () => (filas ?? []).filter((f) => (!persona || personaDe(f) === persona.key) && (!plataforma || f.plataforma === plataforma)),
    [filas, persona, plataforma]
  );

  const datos = useMemo(() => {
    const personas = new Map<string, { fila: Fila; total: number; por: Record<Platform, number>; oficina: number; conDato: number; ultima: string }>();
    for (const f of visibles) {
      const key = personaDe(f);
      // Las filas vienen de la más nueva a la más vieja: la primera de cada uno es su última descarga.
      const p = personas.get(key) ?? { fila: f, total: 0, por: { youtube: 0, instagram: 0, pinterest: 0 }, oficina: 0, conDato: 0, ultima: f.creado };
      p.total++;
      p.por[f.plataforma]++;
      if (f.desde_oficina !== null) p.conDato++;
      if (f.desde_oficina) p.oficina++;
      personas.set(key, p);
    }
    const posteos = new Map<string, { fila: Fila; veces: number; gente: Set<string> }>();
    for (const f of visibles) {
      const key = `${f.plataforma}:${f.posteo_id}`;
      const p = posteos.get(key) ?? { fila: f, veces: 0, gente: new Set<string>() };
      p.veces++;
      p.gente.add(personaDe(f));
      posteos.set(key, p);
    }
    const conDato = visibles.filter((f) => f.desde_oficina !== null);
    return {
      personas: [...personas.entries()].sort((a, b) => b[1].total - a[1].total),
      posteos: [...posteos.values()].sort((a, b) => b.veces - a.veces || b.gente.size - a.gente.size).slice(0, 10),
      plataformas: contar(visibles, (f) => f.plataforma),
      tipos: contar(visibles, (f) => f.tipo),
      destinos: contar(visibles, (f) => f.destino),
      bytes: visibles.reduce((n, f) => n + (f.bytes ?? 0), 0),
      oficina: conDato.filter((f) => f.desde_oficina).length,
      conDato: conDato.length,
      buckets: buckets(visibles, desde),
    };
  }, [visibles, desde]);

  const periodoTexto = periodo === "todo" ? "desde que se empezó a registrar" : `en los últimos ${periodo} días`;
  const semanal = datos.buckets[0]?.label.startsWith("semana") ?? false;
  const elegirPersona = (key: string, fila: Fila) => setPersona((v) => (v?.key === key ? null : { key, fila }));

  return (
    <div className="min-h-screen">
      <ContextBar>
        <BarButton label="Volver a Descargas" icon={ArrowLeft} onClick={() => router.push("/descargas")} />
        <BarDivider />
        <BarSegmented<Periodo> label="Período" value={periodo} onChange={setPeriodo} options={PERIODOS} />
        <BarDivider />
        <BarAction
          label="Exportar CSV"
          icon={FileDown}
          disabled={!visibles.length}
          onClick={() => {
            try {
              exportar(visibles, periodo);
            } catch {
              toast("No se pudo armar el archivo.", "error");
            }
          }}
        />
      </ContextBar>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-6 text-center">
          <h1 className="font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">Métricas de Descargas</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Quién baja qué, desde dónde y a dónde, {periodoTexto}. Solo lo ve quien administra Descargas.
          </p>
        </div>

        {(persona || plataforma) && (
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="text-muted-foreground">Mostrando solo:</span>
            {persona && (
              <button
                type="button"
                onClick={() => setPersona(null)}
                aria-label={`Quitar el filtro de ${nombreDe(persona.fila)}`}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card py-0.5 pl-0.5 pr-2 font-medium hover:border-foreground/30"
              >
                <Avatar fila={persona.fila} className="h-5 w-5" />
                {nombreDe(persona.fila)}
                <X className="h-3 w-3" />
              </button>
            )}
            {plataforma && (
              <button
                type="button"
                onClick={() => setPlataforma(null)}
                aria-label={`Quitar el filtro de ${PLATFORM_NAMES[plataforma]}`}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 font-medium hover:border-foreground/30"
              >
                <PlatformIcon platform={plataforma} className="h-3.5 w-3.5" />
                {PLATFORM_NAMES[plataforma]}
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {error ? (
          <p className="mx-auto flex max-w-md items-start gap-2 rounded-2xl border bg-card p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : !filas ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-24 rounded-3xl" />
            ))}
          </div>
        ) : (
          <div className={cn("space-y-4 transition-opacity", cargando && "opacity-50")} aria-busy={cargando}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Descargas" value={visibles.length.toLocaleString("es-AR")} sub="archivos (cada foto, video o portada)" />
              <Stat label="Personas" value={String(datos.personas.filter(([k]) => k !== SIN_CUENTA).length)} sub="bajaron algo" />
              <Stat
                label="Desde la oficina"
                value={datos.conDato ? `${Math.round((datos.oficina / datos.conDato) * 100)}%` : "–"}
                sub={datos.conDato ? `${datos.oficina} de ${datos.conDato} con dato` : "sin dato todavía"}
              />
              <Stat label="Volumen" value={datos.bytes ? formatBytes(datos.bytes) : "–"} sub="aproximado" />
            </div>

            {!visibles.length ? (
              <p className="rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground">
                {filas.length ? "Nada con estos filtros." : `Todavía no hay descargas ${periodoTexto}.`}
              </p>
            ) : (
              <>
                <Card
                  title={semanal ? "Descargas por semana" : "Descargas por día"}
                  hint="Pasá el mouse (o el foco) por una columna para ver el detalle."
                  action={
                    <button
                      type="button"
                      onClick={() => setVistaTabla((v) => !v)}
                      aria-pressed={vistaTabla}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium hover:border-foreground/30"
                    >
                      {vistaTabla ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
                      {vistaTabla ? "Ver gráfico" : "Ver tabla"}
                    </button>
                  }
                >
                  {vistaTabla ? <DailyTable buckets={datos.buckets} /> : <DailyChart buckets={datos.buckets} />}
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card title="Por plataforma" hint="Tocá una para ver solo esa.">
                    <BarList
                      picked={plataforma}
                      onPick={(k) => setPlataforma((p) => (p === k ? null : (k as Platform)))}
                      items={PLATFORMS.map((p) => ({
                        key: p,
                        name: PLATFORM_NAMES[p],
                        value: datos.plataformas.get(p) ?? 0,
                        label: (
                          <>
                            <PlatformIcon platform={p} />
                            {PLATFORM_NAMES[p]}
                          </>
                        ),
                      }))}
                    />
                  </Card>
                  <Card title="Qué y a dónde">
                    <BarList
                      items={(Object.keys(TIPOS) as Fila["tipo"][])
                        .map((t) => ({ key: t, name: TIPOS[t], label: TIPOS[t], value: datos.tipos.get(t) ?? 0 }))
                        .filter((i) => i.value)}
                    />
                    <div className="my-4 border-t" />
                    <BarList
                      items={(Object.keys(DESTINOS) as Fila["destino"][])
                        .map((d) => ({ key: d, name: DESTINOS[d], label: DESTINOS[d], value: datos.destinos.get(d) ?? 0 }))
                        .filter((i) => i.value)}
                    />
                  </Card>
                </div>

                <Card title="Por persona" hint="Tocá a alguien para ver solo lo suyo.">
                  <div className="-mx-5 overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr className="border-b">
                          <th className="px-5 py-2 text-left font-medium">Persona</th>
                          <th className="px-2 py-2 text-right font-medium">Total</th>
                          {PLATFORMS.map((p) => (
                            <th key={p} className="px-2 py-2 text-right font-medium">
                              <span className="inline-flex" title={PLATFORM_NAMES[p]}>
                                <PlatformIcon platform={p} className="h-3.5 w-3.5" />
                                <span className="sr-only">{PLATFORM_NAMES[p]}</span>
                              </span>
                            </th>
                          ))}
                          <th className="px-2 py-2 text-right font-medium">Oficina</th>
                          <th className="px-5 py-2 text-right font-medium">Última</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {datos.personas.map(([key, p]) => (
                          <tr key={key} className={cn(persona?.key === key && "bg-secondary/70")}>
                            <td className="px-5 py-2">
                              <button
                                type="button"
                                onClick={() => elegirPersona(key, p.fila)}
                                aria-pressed={persona?.key === key}
                                className="flex min-w-0 items-center gap-2 rounded-lg text-left hover:underline"
                              >
                                <Avatar fila={p.fila} />
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{nombreDe(p.fila)}</span>
                                  {p.fila.email && p.fila.nombre && (
                                    <span className="block truncate text-xs text-muted-foreground">{p.fila.email}</span>
                                  )}
                                </span>
                              </button>
                            </td>
                            <td className="px-2 py-2 text-right font-medium tabular-nums">{p.total}</td>
                            {PLATFORMS.map((pl) => (
                              <td key={pl} className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                                {p.por[pl] || "–"}
                              </td>
                            ))}
                            <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                              {p.conDato ? `${Math.round((p.oficina / p.conDato) * 100)}%` : "–"}
                            </td>
                            <td className="whitespace-nowrap px-5 py-2 text-right text-xs text-muted-foreground">
                              {CUANDO.format(new Date(p.ultima))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card title="Lo más bajado" hint="Los posteos que más se bajaron, y por cuántas personas.">
                  <ol className="space-y-2">
                    {datos.posteos.map(({ fila: f, veces, gente }, i) => (
                      <li key={`${f.plataforma}:${f.posteo_id}`} className="flex items-center gap-3 text-sm">
                        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                        <PlatformIcon platform={f.plataforma} className="text-muted-foreground" />
                        <span className="sr-only">{PLATFORM_NAMES[f.plataforma]}</span>
                        <a
                          href={f.posteo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 truncate hover:underline"
                          title={f.titulo ?? f.posteo_url}
                        >
                          {f.titulo || f.posteo_url}
                          {f.autor && <span className="text-muted-foreground"> · {f.autor}</span>}
                        </a>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          <span className="font-medium text-foreground">{veces}</span> {veces === 1 ? "vez" : "veces"} · {gente.size}{" "}
                          {gente.size === 1 ? "persona" : "personas"}
                        </span>
                      </li>
                    ))}
                  </ol>
                </Card>

                <Card title="Actividad reciente" hint="Cada archivo que se bajó, del más nuevo al más viejo.">
                  <div className="-mx-5 overflow-x-auto">
                    <table className="w-full min-w-[44rem] text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr className="border-b">
                          <th className="px-5 py-2 text-left font-medium">Cuándo</th>
                          <th className="px-2 py-2 text-left font-medium">Quién</th>
                          <th className="px-2 py-2 text-left font-medium">Qué</th>
                          <th className="px-2 py-2 text-left font-medium">Posteo</th>
                          <th className="px-2 py-2 text-left font-medium">A dónde</th>
                          <th className="px-5 py-2 text-left font-medium">Desde</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {visibles.slice(0, recientes).map((f) => (
                          <tr key={f.id}>
                            <td className="whitespace-nowrap px-5 py-2 text-xs text-muted-foreground">{CUANDO.format(new Date(f.creado))}</td>
                            <td className="px-2 py-2">
                              <span className="flex items-center gap-2">
                                <Avatar fila={f} className="h-6 w-6" />
                                <span className="truncate">{nombreDe(f)}</span>
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-2 py-2">
                              <span className="inline-flex items-center gap-1.5">
                                <PlatformIcon platform={f.plataforma} className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="sr-only">{PLATFORM_NAMES[f.plataforma]}:</span>
                                {TIPO_UNO[f.tipo]}
                                {detalle(f) && <span className="text-xs text-muted-foreground">{detalle(f)}</span>}
                              </span>
                            </td>
                            <td className="max-w-[16rem] px-2 py-2">
                              <a href={f.posteo_url} target="_blank" rel="noreferrer" className="block truncate hover:underline" title={f.titulo ?? f.posteo_url}>
                                {f.titulo || f.posteo_url}
                              </a>
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{DESTINOS[f.destino]}</td>
                            <td className="whitespace-nowrap px-5 py-2 text-muted-foreground" title={f.desde_oficina === null ? "No se pudo saber" : undefined}>
                              {desdeTexto(f.desde_oficina)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {visibles.length > recientes && (
                    <button
                      type="button"
                      onClick={() => setRecientes((n) => n + 100)}
                      className="mt-3 w-full rounded-full border py-1.5 text-xs font-medium hover:border-foreground/30"
                    >
                      Ver más ({visibles.length - recientes} más)
                    </button>
                  )}
                </Card>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
