"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, UserPlus } from "lucide-react";
import { Empty, Section, SmallAction } from "@/components/clients/profile/Section";
import { useInfluencers } from "@/hooks/useInfluencers";
import { porPerfil, totales } from "@/lib/influencity/rendimiento";
import { corto, porcentaje } from "@/lib/influencity/tipos";
import type { Brand } from "@/lib/types";
import { AgregarInfluencerDialog } from "./AgregarInfluencerDialog";
import { Foto, NombrePerfil } from "./comun";
import { InfluencersVinculados } from "./Vinculados";

const TOP = 6;

/**
 * En la ficha del cliente: los influencers que trabajaron con él (medidos por Influencity o
 * anotados a mano), los que más rindieron arriba, y el acceso al tablero filtrado.
 */
export function InfluencersSection({ brand }: { brand: Brand }) {
  const { data, loaded, sinMigracion } = useInfluencers();
  const [agregar, setAgregar] = useState(false);

  const vista = useMemo(() => {
    if (!data) return null;
    const cuentas = new Set(data.perfiles.filter((p) => p.cuenta_de).map((p) => p.id));
    const filas = data.rendimiento.filter((r) => r.brand_id === brand.id && !cuentas.has(r.perfil_id));
    const stats = porPerfil(filas);
    const perfiles = new Map(data.perfiles.map((p) => [p.id, p]));
    const medidos = [...stats]
      .sort((a, b) => b[1].views - a[1].views || b[1].interacciones - a[1].interacciones)
      .map(([id, s]) => ({ perfil: perfiles.get(id)!, s }))
      .filter((x) => x.perfil);
    const aMano = data.vinculos.filter((v) => v.tipo === "cliente" && v.brand_id === brand.id).length;
    return { total: totales(filas), medidos, aMano };
  }, [data, brand.id]);

  if (sinMigracion) return null;
  const cantidad = (vista?.medidos.length ?? 0) + (vista?.aMano ?? 0);

  return (
    <Section
      title="Influencers"
      hint={`Quiénes trabajaron con ${brand.name} y cómo rindieron, con lo que mide Influencity.`}
      action={
        <>
          <SmallAction onClick={() => setAgregar(true)}>
            <UserPlus /> Agregar
          </SmallAction>
          {cantidad > 0 && (
            <SmallAction href={`/influencers?cliente=${brand.id}`}>
              <ArrowUpRight /> Ver todo
            </SmallAction>
          )}
        </>
      }
    >
      {!loaded || !vista ? (
        <div className="skeleton h-24 rounded-2xl" />
      ) : (
        <div className="space-y-4">
          {vista.medidos.length === 0 && (
            <Empty>Influencity todavía no midió nada de {brand.name}. Cuando mida una campaña suya, aparecen acá los influencers y cómo rindieron.</Empty>
          )}
          {vista.medidos.length > 0 && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Influencers", String(vista.medidos.length)],
                ["Publicaciones", corto(vista.total.publicaciones)],
                ["Vistas", corto(vista.total.views)],
                ["Engagement", porcentaje(vista.total.engagement)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-secondary/55 px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">{k}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {vista.medidos.length > 0 && (
            <ol className="divide-y">
              {vista.medidos.slice(0, TOP).map(({ perfil, s }) => (
                <li key={perfil.id}>
                  <Link href={`/influencers/${perfil.id}`} className="flex items-center gap-3 rounded-xl py-2 transition-colors hover:bg-secondary/50">
                    <Foto perfil={perfil} />
                    <NombrePerfil perfil={perfil} className="flex-1" />
                    <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      <span className="block text-sm font-semibold text-foreground">{corto(s.views)} vistas</span>
                      {s.publicaciones} {s.publicaciones === 1 ? "publicación" : "publicaciones"} · {porcentaje(s.engagement)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {vista.medidos.length > TOP && (
            <p className="text-center text-xs text-muted-foreground">
              y {vista.medidos.length - TOP} más en{" "}
              <Link href={`/influencers?cliente=${brand.id}`} className="font-medium text-foreground underline underline-offset-2">
                Influencers
              </Link>
            </p>
          )}

          <div>
            <p className="eyebrow text-muted-foreground">Trabajaron con {brand.name} (anotado a mano)</p>
            <InfluencersVinculados tipo="cliente" refId={brand.id} brandId={brand.id} className="mt-2" />
          </div>
        </div>
      )}
      <AgregarInfluencerDialog open={agregar} onOpenChange={setAgregar} cliente={brand.id} />
    </Section>
  );
}
