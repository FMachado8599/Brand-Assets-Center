"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { useInfluencers } from "@/hooks/useInfluencers";
import { corto } from "@/lib/influencity/tipos";
import { fold } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { Foto, NombrePerfil } from "./comun";

/**
 * Lista con buscador para elegir influencers (varios a la vez). Primero los elegidos, después
 * los que ya trabajaron con el cliente y después el resto, por seguidores.
 */
export function ElegirPerfiles({
  elegidos,
  onChange,
  cliente,
  max,
  className,
}: {
  elegidos: string[];
  onChange: (ids: string[]) => void;
  /** Los que ya trabajaron con este cliente van primero. */
  cliente?: string | null;
  max?: number;
  className?: string;
}) {
  const { data } = useInfluencers();
  const [buscar, setBuscar] = useState("");

  const lista = useMemo(() => {
    if (!data) return [];
    const delCliente = new Set<string>();
    if (cliente) {
      for (const r of data.rendimiento) if (r.brand_id === cliente) delCliente.add(r.perfil_id);
      for (const v of data.vinculos) if (v.tipo === "cliente" && v.brand_id === cliente) delCliente.add(v.perfil_id);
    }
    const q = fold(buscar).trim();
    return data.perfiles
      .filter((p) => !p.cuenta_de && (!q || fold(`${p.nombre ?? ""} ${p.usuario}`).includes(q)))
      .map((p) => ({ p, rango: elegidos.includes(p.id) ? 0 : delCliente.has(p.id) ? 1 : 2, delCliente: delCliente.has(p.id) }))
      .sort((a, b) => a.rango - b.rango || (b.p.seguidores ?? 0) - (a.p.seguidores ?? 0))
      .slice(0, 80);
  }, [data, buscar, cliente, elegidos]);

  const alternar = (id: string) => {
    if (elegidos.includes(id)) onChange(elegidos.filter((x) => x !== id));
    else if (!max || elegidos.length < max) onChange([...elegidos, id]);
  };

  return (
    <div className={cn("rounded-xl border", className)}>
      <label className="flex items-center gap-2 border-b px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar un influencer"
          aria-label="Buscar un influencer"
          className="h-10 w-full bg-transparent text-sm outline-none"
        />
        {elegidos.length > 0 && <span className="shrink-0 text-xs text-muted-foreground">{elegidos.length} elegidos</span>}
      </label>
      <ul className="max-h-60 overflow-y-auto p-1" role="listbox" aria-multiselectable aria-label="Influencers">
        {lista.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">{data?.perfiles.length ? "Nadie con ese nombre." : "Todavía no hay influencers."}</li>
        ) : (
          lista.map(({ p, delCliente }) => {
            const si = elegidos.includes(p.id);
            return (
              <li key={p.id} role="option" aria-selected={si}>
                <button
                  type="button"
                  onClick={() => alternar(p.id)}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary", si && "bg-secondary")}
                >
                  <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", si ? "border-ink bg-ink text-cream" : "border-input")}>
                    {si && <Check className="h-3 w-3" />}
                  </span>
                  <Foto perfil={p} className="h-7 w-7 text-[9px]" />
                  <NombrePerfil perfil={p} className="flex-1" />
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {corto(p.seguidores)}
                    {delCliente && <span className="block text-[10px]">ya trabajó</span>}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
