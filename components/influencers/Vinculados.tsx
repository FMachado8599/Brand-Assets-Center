"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cambiarInfluencers, useInfluencers } from "@/hooks/useInfluencers";
import { desvincular, vincular } from "@/lib/influencity/datos";
import { cn } from "@/lib/utils";
import { Foto } from "./comun";
import { ElegirPerfiles } from "./ElegirPerfiles";

/**
 * Los influencers vinculados a algo de otra herramienta (un cliente, una pieza o plani de
 * Planificación, una tarea del Board…) y el botón para sumar o sacar. Quien lo usa dice qué es
 * (tipo + refId) y cómo se ve desde la ficha del influencer (titulo + href).
 *
 *   <InfluencersVinculados tipo="pieza" refId={pieza.id} brandId={plani.brand_id}
 *     titulo={`${plani.titulo} · ${pieza.titulo}`} href={`/planificacion/${plani.id}`} />
 */
export function InfluencersVinculados({
  tipo,
  refId,
  brandId,
  titulo,
  href,
  className,
}: {
  tipo: string;
  refId: string;
  brandId?: string | null;
  titulo?: string | null;
  href?: string | null;
  className?: string;
}) {
  const { data, sinMigracion } = useInfluencers();
  const vinculos = useMemo(() => (data?.vinculos ?? []).filter((v) => v.tipo === tipo && v.ref === refId), [data, tipo, refId]);
  const perfiles = useMemo(() => new Map((data?.perfiles ?? []).map((p) => [p.id, p])), [data]);
  if (sinMigracion) return null;

  const cambiar = (ids: string[]) => {
    const antes = new Set(vinculos.map((v) => v.perfil_id));
    const nuevo = ids.find((id) => !antes.has(id));
    const fuera = vinculos.find((v) => !ids.includes(v.perfil_id));
    if (nuevo) cambiarInfluencers(() => vincular({ perfil_id: nuevo, tipo, ref: refId, brand_id: brandId ?? null, titulo: titulo ?? null, href: href ?? null }));
    else if (fuera) cambiarInfluencers(() => desvincular(fuera.id));
  };

  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {vinculos.map((v) => {
        const p = perfiles.get(v.perfil_id);
        if (!p) return null;
        return (
          <li key={v.id} className="inline-flex items-center rounded-full border bg-card py-0.5 pl-0.5 text-xs font-medium">
            <Link href={`/influencers/${p.id}`} className="inline-flex items-center gap-1.5 pr-1 hover:underline">
              <Foto perfil={p} className="h-6 w-6 text-[9px]" />@{p.usuario}
            </Link>
            <button
              type="button"
              aria-label={`Desvincular a @${p.usuario}`}
              onClick={() => cambiarInfluencers(() => desvincular(v.id))}
              className="mr-0.5 grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        );
      })}
      <li>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-2.5 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Influencer
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-2">
            <ElegirPerfiles elegidos={vinculos.map((v) => v.perfil_id)} onChange={cambiar} cliente={brandId} className="border-0" />
          </PopoverContent>
        </Popover>
      </li>
    </ul>
  );
}
