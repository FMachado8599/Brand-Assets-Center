"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, BadgeCheck, ImageOff, Link2, Loader2, Radar, RefreshCw, Sparkles, X } from "lucide-react";
import { BarAction, BarButton, BarDivider, ContextBar } from "@/components/shell/ContextBar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { useClients } from "@/hooks/useClients";
import { cambiarInfluencers, pedirInfluencity, refreshInfluencers, useInfluencers } from "@/hooks/useInfluencers";
import { refreshInfluencity, useInfluencity } from "@/hooks/useInfluencity";
import { asignarCliente, cargarDetalle, cargarPublicaciones, desvincular, guardarNotas, vincular } from "@/lib/influencity/datos";
import { porCliente, sumar } from "@/lib/influencity/rendimiento";
import {
  corto,
  estadoAnalisis,
  fechaCorta,
  nombreRed,
  ORIGEN_CLIENTE,
  porcentaje,
  REDES_CON_ANALISIS,
  type Publicacion,
  type RedInfluencity,
} from "@/lib/influencity/tipos";
import { timeAgo } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { AsignarCliente } from "./AsignarCliente";
import { Audiencia } from "./Audiencia";
import { Card, ClienteChip, FaltaMigracion, Foto, InfluencersNav, RedIcon, Stat } from "./comun";

const PUBLICACIONES = 24;
const TIPOS: Record<string, string> = { photo: "Foto", reel: "Reel", story: "Historia", video: "Video", carousel: "Carrusel", short: "Short" };

/**
 * La ficha de un influencer: su perfil y audiencia, cómo rindió para cada cliente, sus
 * publicaciones medidas y dónde aparece en el resto de las herramientas.
 */
export function PerfilView({ id }: { id: string }) {
  const { data, loaded, error, sinMigracion } = useInfluencers();
  const inf = useInfluencity();
  const { clients } = useClients();
  const confirm = useConfirm();
  const [detalle, setDetalle] = useState<Record<string, unknown> | null>(null);
  const [pubs, setPubs] = useState<Publicacion[] | null>(null);
  const [mostrar, setMostrar] = useState(PUBLICACIONES);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [notas, setNotas] = useState<string | null>(null);
  const [nuevoCliente, setNuevoCliente] = useState("");

  const perfil = data?.perfiles.find((p) => p.id === id) ?? null;
  const clientePorId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const cargar = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([cargarDetalle(id), cargarPublicaciones({ perfil: id })]);
      setDetalle(d);
      setPubs(p);
    } catch (e) {
      toast((e as Error).message, "error");
      setPubs([]);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (perfil && notas === null) setNotas(perfil.notas ?? "");
  }, [perfil, notas]);

  const filas = useMemo(() => (data?.rendimiento ?? []).filter((r) => r.perfil_id === id), [data, id]);
  const total = useMemo(() => sumar(filas), [filas]);
  const clientes = useMemo(() => [...porCliente(filas)].sort((a, b) => b[1].views - a[1].views || b[1].publicaciones - a[1].publicaciones), [filas]);
  const vinculos = useMemo(() => (data?.vinculos ?? []).filter((v) => v.perfil_id === id), [data, id]);
  const trackings = useMemo(() => {
    const ids = new Set((pubs ?? []).flatMap((p) => p.trackings));
    return (data?.trackings ?? []).filter((t) => ids.has(t.id));
  }, [pubs, data]);

  const accion = async (accion: "leer" | "analizar" | "refrescar") => {
    setOcupado(accion);
    try {
      await pedirInfluencity(`/perfiles/${id}`, { accion });
      toast(accion === "leer" ? "Datos al día" : "Influencity está analizando la audiencia. Puede tardar unos minutos.");
      if (accion !== "leer") refreshInfluencity();
      await Promise.all([refreshInfluencers(), cargar()]);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setOcupado(null);
    }
  };

  const seguir = async () => {
    const ok = await confirm({
      title: "¿Medir todo lo que publica?",
      description: "Se crea una campaña en Influencity con todo lo que publique este perfil desde hoy. Ocupa un lugar de perfiles del plan.",
      confirmLabel: "Crear la campaña",
    });
    if (!ok) return;
    setOcupado("seguir");
    await cambiarInfluencers(() => pedirInfluencity("/trackings", { tipo: "perfil", perfil_id: id }), "Campaña creada: mide todo lo que publique");
    setOcupado(null);
  };

  if (sinMigracion) {
    return (
      <Marco>
        <FaltaMigracion className="mx-auto max-w-2xl" />
      </Marco>
    );
  }
  if (error) {
    return (
      <Marco>
        <p className="mx-auto max-w-md rounded-2xl border bg-card p-4 text-center text-sm text-destructive">{error}</p>
      </Marco>
    );
  }
  if (!loaded) {
    return (
      <Marco>
        <div className="skeleton mx-auto h-40 max-w-3xl rounded-3xl" />
      </Marco>
    );
  }
  if (!perfil) {
    return (
      <Marco>
        <p className="mx-auto max-w-md rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Ese influencer no está.{" "}
          <Link href="/influencers" className="font-medium text-foreground underline underline-offset-2">
            Volver a la lista
          </Link>
        </p>
      </Marco>
    );
  }

  const puedeAnalizar = REDES_CON_ANALISIS.includes(perfil.red as RedInfluencity) && !perfil.detalle_error;
  const analizado = perfil.estado === "ok" || perfil.estado === "update" || perfil.estado === "autoRefresh";
  const cuentaDe = perfil.cuenta_de ? clientePorId.get(perfil.cuenta_de) : null;
  const visibles = (pubs ?? []).slice(0, mostrar);
  const vinculosCliente = vinculos.filter((v) => v.tipo === "cliente");
  const otrosVinculos = vinculos.filter((v) => v.tipo !== "cliente");
  const yaVinculados = new Set(vinculosCliente.map((v) => v.ref));

  return (
    <div className="min-h-screen">
      <ContextBar>
        <InfluencersNav />
        <BarDivider />
        {perfil.url && (
          <a
            href={perfil.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Abrir en ${nombreRed(perfil.red)}`}
            title={`Abrir en ${nombreRed(perfil.red)}`}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream"
          >
            <ArrowUpRight className="h-[18px] w-[18px]" />
          </a>
        )}
        {inf.conectada && !perfil.detalle_error && (
          <>
            <BarButton
              label="Volver a leer sus datos de Influencity"
              icon={ocupado === "leer" ? Loader2 : RefreshCw}
              onClick={() => accion("leer")}
              disabled={ocupado !== null}
              className={cn(ocupado === "leer" && "[&>svg]:animate-spin")}
            />
            {puedeAnalizar && (
              <BarAction
                label={analizado ? "Actualizar la audiencia" : "Analizar la audiencia"}
                icon={ocupado === "analizar" || ocupado === "refrescar" || perfil.analizando ? Loader2 : Sparkles}
                onClick={() => accion(analizado ? "refrescar" : "analizar")}
                disabled={ocupado !== null || perfil.analizando || inf.cuotas?.analisis?.restantes === 0}
                className={cn((ocupado === "analizar" || ocupado === "refrescar" || perfil.analizando) && "[&>svg]:animate-spin")}
              >
                {perfil.analizando ? "Analizando…" : analizado ? "Actualizar audiencia" : "Analizar audiencia"}
              </BarAction>
            )}
          </>
        )}
      </ContextBar>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <header className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-end sm:text-left">
          <Foto perfil={perfil} className="h-24 w-24 text-2xl ring-4 ring-card" />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center justify-center gap-2 font-display text-4xl leading-none tracking-[-0.01em] sm:justify-start sm:text-5xl">
              <span className="truncate">{perfil.nombre || `@${perfil.usuario}`}</span>
              {perfil.verificado && <BadgeCheck aria-label="Verificado" className="h-6 w-6 shrink-0 text-sky-600" />}
            </h1>
            <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground sm:justify-start">
              <span className="inline-flex items-center gap-1">
                <RedIcon red={perfil.red} className="h-3.5 w-3.5" />@{perfil.usuario}
              </span>
              {perfil.seguidores != null && <span>{corto(perfil.seguidores)} seguidores</span>}
              {perfil.engagement != null && <span>{porcentaje(perfil.engagement)} de engagement</span>}
              {perfil.pais && <span>{perfil.pais}</span>}
              {perfil.tipo_cuenta && <span>{perfil.tipo_cuenta}</span>}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {perfil.detalle_error
                ? "Influencity no tiene su ficha (apareció en una campaña, pero no está en el IRM de la cuenta)."
                : `${estadoAnalisis(perfil.estado)} · ${perfil.detalle_leido ? `datos de ${timeAgo(perfil.detalle_leido, Date.now())}` : "sin leer todavía"}`}
            </p>
          </div>
        </header>

        {cuentaDe && (
          <p className="mt-4 rounded-2xl bg-primary/25 px-4 py-2.5 text-center text-sm">
            Es una cuenta de <strong>{cuentaDe.name}</strong> (está en las redes de su ficha): no cuenta como influencer.
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Publicaciones" value={corto(total.publicaciones)} sub={total.patrocinadas ? `${total.patrocinadas} como publicidad` : "medidas"} />
          <Stat label="Vistas" value={corto(total.views)} />
          <Stat label="Interacciones" value={corto(total.interacciones)} />
          <Stat label="Engagement" value={porcentaje(total.engagement)} sub="promedio por publicación" />
          <Stat label="Clientes" value={String(new Set([...total.clientes, ...vinculosCliente.map((v) => v.ref)]).size)} sub={total.ultima ? `última ${fechaCorta(total.ultima)}` : undefined} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card title="Por cliente" hint="Cómo rindió para cada uno (con lo que midió Influencity).">
            {clientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay publicaciones medidas.</p>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 pb-2 text-left font-medium">Cliente</th>
                      <th className="px-2 pb-2 text-right font-medium">Publ.</th>
                      <th className="px-2 pb-2 text-right font-medium">Vistas</th>
                      <th className="px-2 pb-2 text-right font-medium">Interac.</th>
                      <th className="px-2 pb-2 text-right font-medium">Eng.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {clientes.map(([brandId, s]) => {
                      const c = brandId ? clientePorId.get(brandId) : null;
                      return (
                        <tr key={brandId || "sin"}>
                          <td className="px-2 py-2">
                            {c ? <ClienteChip brand={c} href={`/clientes/${c.id}`} /> : <span className="text-xs text-muted-foreground">Sin cliente</span>}
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {fechaCorta(s.primera)}
                              {s.ultima && s.ultima !== s.primera ? ` → ${fechaCorta(s.ultima)}` : ""}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{s.publicaciones}</td>
                          <td className="px-2 py-2 text-right font-medium tabular-nums">{corto(s.views)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{corto(s.interacciones)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{porcentaje(s.engagement)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Trabajó con" hint="Lo que no midió Influencity también se anota acá.">
            {vinculosCliente.length > 0 && (
              <ul className="mb-3 space-y-2">
                {vinculosCliente.map((v) => {
                  const c = clientePorId.get(v.ref);
                  return (
                    <li key={v.id} className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        {c ? <ClienteChip brand={c} href={`/clientes/${c.id}`} /> : <span className="text-xs text-muted-foreground">Cliente borrado</span>}
                        {v.nota && <p className="mt-0.5 text-xs">{v.nota}</p>}
                        <p className="text-[11px] text-muted-foreground">
                          {fechaCorta(v.creado)}
                          {v.creado_por ? ` · ${v.creado_por}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Quitar ${c?.name ?? "cliente"}`}
                        onClick={() => cambiarInfluencers(() => desvincular(v.id))}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Select
              value={nuevoCliente}
              onValueChange={(v) => {
                setNuevoCliente("");
                cambiarInfluencers(() => vincular({ perfil_id: id, tipo: "cliente", ref: v, brand_id: v }), "Anotado");
              }}
            >
              <SelectTrigger aria-label="Anotar un cliente con el que trabajó" className="h-9 rounded-full text-sm text-muted-foreground">
                <SelectValue placeholder="Anotar un cliente…" />
              </SelectTrigger>
              <SelectContent>
                {clients
                  .filter((c) => !yaVinculados.has(c.id))
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {otrosVinculos.length > 0 && (
              <div className="mt-4">
                <p className="eyebrow text-muted-foreground">En otras herramientas</p>
                <ul className="mt-1.5 space-y-1">
                  {otrosVinculos.map((v) => (
                    <li key={v.id} className="flex items-center gap-2 text-sm">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {v.href ? (
                        <Link href={v.href} className="min-w-0 truncate underline-offset-2 hover:underline">
                          {v.titulo ?? v.tipo}
                        </Link>
                      ) : (
                        <span className="min-w-0 truncate">{v.titulo ?? v.tipo}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <Card title="Audiencia" className="mt-4">
          <Audiencia detalle={detalle} />
        </Card>

        <Card
          title="Publicaciones medidas"
          hint={pubs ? `${pubs.length} en ${trackings.length} ${trackings.length === 1 ? "campaña" : "campañas"}` : undefined}
          className="mt-4"
          action={
            inf.conectada && !perfil.detalle_error ? (
              <Button variant="outline" size="sm" className="rounded-full" onClick={seguir} disabled={ocupado !== null}>
                {ocupado === "seguir" ? <Loader2 className="animate-spin" /> : <Radar />}
                Medir todo lo que publica
              </Button>
            ) : undefined
          }
        >
          {pubs === null ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton aspect-[4/5] rounded-2xl" />
              ))}
            </div>
          ) : pubs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna todavía.</p>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {visibles.map((p) => (
                  <PublicacionCard
                    key={p.id}
                    p={p}
                    colaboracion={p.perfiles.length > 1}
                    onCliente={(brand, auto) =>
                      cambiarInfluencers(async () => {
                        await asignarCliente("publicacion", p.id, brand, auto);
                        await cargar();
                      }, auto ? "Vuelve a ser automático" : "Cliente guardado")
                    }
                  />
                ))}
              </ul>
              {pubs.length > mostrar && (
                <div className="mt-4 text-center">
                  <button type="button" onClick={() => setMostrar((m) => m + PUBLICACIONES)} className="text-sm font-medium text-muted-foreground hover:text-foreground">
                    Ver más ({pubs.length - mostrar})
                  </button>
                </div>
              )}
            </>
          )}
        </Card>

        <Card title="Notas" hint="Para el equipo: tarifas, cómo fue trabajar con él o ella, contacto." className="mt-4">
          <textarea
            value={notas ?? ""}
            onChange={(e) => setNotas(e.target.value)}
            onBlur={() => {
              if ((notas ?? "") === (perfil.notas ?? "")) return;
              cambiarInfluencers(() => guardarNotas(id, notas ?? ""), "Notas guardadas");
            }}
            rows={4}
            placeholder="Escribí algo…"
            aria-label="Notas sobre este influencer"
            className="w-full resize-y rounded-xl border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Card>
      </main>
    </div>
  );
}

function Marco({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <ContextBar>
        <InfluencersNav />
      </ContextBar>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-[6.5rem] sm:px-6">{children}</main>
    </div>
  );
}

function PublicacionCard({ p, colaboracion, onCliente }: { p: Publicacion; colaboracion: boolean; onCliente: (brand: string | null, auto: boolean) => void }) {
  const [rota, setRota] = useState(false);
  const metricas: [string, number | null][] = [
    ["vistas", p.views],
    ["likes", p.likes],
    ["coment.", p.comentarios],
  ];
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-background">
      <a href={p.url ?? undefined} target="_blank" rel="noreferrer" className="relative block aspect-[4/5] bg-secondary" aria-label={`Abrir la publicación del ${fechaCorta(p.fecha)}`}>
        {p.imagen && !rota ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setRota(true)} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-muted-foreground">
            <ImageOff className="h-6 w-6" />
          </span>
        )}
        <span className="absolute left-2 top-2 flex flex-wrap gap-1">
          {p.tipo && <span className="rounded-full bg-ink/75 px-2 py-0.5 text-[10px] font-medium text-cream">{TIPOS[p.tipo] ?? p.tipo}</span>}
          {p.patrocinada && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Publicidad</span>}
          {colaboracion && <span className="rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-medium">Colaboración</span>}
          {p.estado_red === "removed" && <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-medium text-destructive-foreground">Borrada</span>}
        </span>
      </a>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <p className="text-[11px] text-muted-foreground">{fechaCorta(p.fecha)}</p>
        <p className="flex flex-wrap gap-x-2.5 text-xs">
          {metricas.map(([k, v]) =>
            v != null ? (
              <span key={k}>
                <span className="font-semibold tabular-nums">{corto(v)}</span> <span className="text-muted-foreground">{k}</span>
              </span>
            ) : null
          )}
          {p.engagement != null && (
            <span>
              <span className="font-semibold tabular-nums">{porcentaje(p.engagement)}</span> <span className="text-muted-foreground">eng.</span>
            </span>
          )}
        </p>
        <div className="mt-auto">
          <AsignarCliente label="Cliente de esta publicación" value={p.brand_id} manual={p.brand_manual} onChange={onCliente} className="w-full" />
          {p.brand_origen && !p.brand_manual && <p className="mt-1 text-[10px] text-muted-foreground">{ORIGEN_CLIENTE[p.brand_origen] ?? p.brand_origen}</p>}
        </div>
      </div>
    </li>
  );
}
