"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { BarDivider, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { useClients } from "@/hooks/useClients";
import { useInfluencers } from "@/hooks/useInfluencers";
import { useInfluencity } from "@/hooks/useInfluencity";
import { anios, filtrar, PERIODOS, porCliente, porPerfil, type Periodo } from "@/lib/influencity/rendimiento";
import { corto, porcentaje } from "@/lib/influencity/tipos";
import { fold } from "@/lib/redaccion/text";
import { Encabezado, FaltaMigracion, Foto, InfluencersNav, Pildoras, SinConexion } from "./comun";

/**
 * Por cliente: cuántos influencers trabajaron, cuánto se publicó y cómo rindió, y quiénes
 * rindieron más. Cada tarjeta lleva al tablero filtrado por ese cliente.
 */
export function ClientesView() {
  const { data, loaded, error, sinMigracion } = useInfluencers();
  const inf = useInfluencity({ auto: true });
  const { clients } = useClients();
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [buscar, setBuscar] = useState("");

  const vista = useMemo(() => {
    if (!data) return null;
    const perfiles = new Map(data.perfiles.map((p) => [p.id, p]));
    const cuentas = new Set(data.perfiles.filter((p) => p.cuenta_de).map((p) => p.id));
    const filas = filtrar(data.rendimiento, { periodo, clientes: [], redes: [] }).filter((r) => !cuentas.has(r.perfil_id));
    const stats = porCliente(filas);

    // Los cargados a mano ("trabajó con") suman influencers aunque no haya publicaciones medidas.
    const aMano = new Map<string, Set<string>>();
    if (periodo === "todo") {
      for (const v of data.vinculos) {
        if (v.tipo !== "cliente" || !v.brand_id) continue;
        if (!aMano.has(v.brand_id)) aMano.set(v.brand_id, new Set());
        aMano.get(v.brand_id)!.add(v.perfil_id);
      }
    }

    const q = fold(buscar).trim();
    const tarjetas = clients
      .filter((c) => stats.has(c.id) || aMano.has(c.id))
      .filter((c) => !q || fold(c.name).includes(q))
      .map((c) => {
        const s = stats.get(c.id) ?? null;
        const influencers = new Set([...(s?.perfiles ?? []), ...(aMano.get(c.id) ?? [])]);
        // Los que más vistas tuvieron para este cliente.
        const top = [...porPerfil(filas.filter((r) => r.brand_id === c.id))]
          .sort((a, b) => b[1].views - a[1].views || b[1].interacciones - a[1].interacciones)
          .slice(0, 5)
          .map(([id, st]) => ({ perfil: perfiles.get(id), st }))
          .filter((x) => x.perfil);
        return { cliente: c, s, influencers: influencers.size, top };
      })
      .sort((a, b) => (b.s?.views ?? 0) - (a.s?.views ?? 0) || b.influencers - a.influencers);

    const sinCliente = stats.get("") ?? null;
    const periodos = [...PERIODOS, ...anios(data.rendimiento).map((a) => ({ value: `a${a}` as Periodo, label: a }))];
    return { tarjetas, sinCliente, periodos };
  }, [data, clients, periodo, buscar]);

  return (
    <div className="min-h-screen">
      <ContextBar>
        <InfluencersNav />
        <BarDivider />
        <BarSearch value={buscar} onChange={setBuscar} placeholder="Buscar un cliente" className="w-[clamp(7rem,16vw,12rem)]" />
      </ContextBar>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <Encabezado titulo="Por cliente">Qué influencers trabajó cada cliente, cuánto publicaron y cuáles rindieron más.</Encabezado>

        {sinMigracion || inf.sinMigracion ? (
          <FaltaMigracion className="mx-auto mb-6 max-w-2xl" />
        ) : inf.loaded && !inf.conectada ? (
          <SinConexion className="mx-auto mb-6 max-w-2xl" />
        ) : null}

        {error && !sinMigracion ? (
          <p className="mx-auto max-w-md rounded-2xl border bg-card p-4 text-center text-sm text-destructive">{error}</p>
        ) : !loaded || !vista ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-52 rounded-3xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="mb-4 flex justify-center">
              <Pildoras<Periodo> label="Período" value={periodo} onChange={setPeriodo} options={vista.periodos} />
            </div>

            {vista.sinCliente && vista.sinCliente.publicaciones > 0 && (
              <p className="mx-auto mb-5 max-w-2xl rounded-2xl border bg-card px-4 py-3 text-center text-sm">
                <span className="font-medium">
                  {corto(vista.sinCliente.publicaciones)} {vista.sinCliente.publicaciones === 1 ? "publicación" : "publicaciones"}
                </span>{" "}
                de {vista.sinCliente.perfiles.length} {vista.sinCliente.perfiles.length === 1 ? "influencer" : "influencers"}{" "}
                {vista.sinCliente.publicaciones === 1 ? "todavía no tiene" : "todavía no tienen"} cliente.{" "}
                <Link href="/influencers/campanas" className="font-semibold underline underline-offset-2">
                  Elegí el cliente de cada campaña
                </Link>
              </p>
            )}

            {vista.tarjetas.length === 0 ? (
              <p className="rounded-3xl border bg-card p-10 text-center text-sm text-muted-foreground">
                {buscar ? "Ningún cliente con ese nombre tiene influencers." : "Todavía no hay clientes con influencers medidos."}
              </p>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {vista.tarjetas.map(({ cliente, s, influencers, top }) => (
                  <li key={cliente.id}>
                    <Link
                      href={`/influencers?cliente=${cliente.id}`}
                      className="group flex h-full flex-col rounded-3xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center gap-3">
                        <ClientMark brand={cliente} className="h-11 w-11 rounded-2xl text-base" photoPad="" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-2xl leading-none">{cliente.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {influencers} {influencers === 1 ? "influencer" : "influencers"}
                          </p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
                      </div>

                      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                        {[
                          ["Publicaciones", corto(s?.publicaciones ?? 0)],
                          ["Vistas", corto(s?.views ?? 0)],
                          ["Engagement", porcentaje(s?.engagement)],
                        ].map(([k, v]) => (
                          <div key={k} className="rounded-2xl bg-secondary/55 px-2 py-2">
                            <dt className="text-[11px] text-muted-foreground">{k}</dt>
                            <dd className="mt-0.5 text-base font-semibold tabular-nums">{v}</dd>
                          </div>
                        ))}
                      </dl>

                      {top.length > 0 && (
                        <div className="mt-4">
                          <p className="eyebrow text-muted-foreground">Los que más rindieron</p>
                          <ol className="mt-2 space-y-1.5">
                            {top.slice(0, 3).map(({ perfil, st }) => (
                              <li key={perfil!.id} className="flex items-center gap-2 text-sm">
                                <Foto perfil={perfil!} className="h-6 w-6 text-[9px]" />
                                <span className="min-w-0 flex-1 truncate">@{perfil!.usuario}</span>
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{corto(st.views)} vistas</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
