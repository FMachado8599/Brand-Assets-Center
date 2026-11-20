"use client";

import { useState, type ReactNode } from "react";
import { ClientMark } from "@/components/clients/ClientMark";
import { Chip } from "@/components/tareas/equipo/piezas";
import type { Persona } from "@/lib/board/equipo";
import { fueraDeOficina, nombreDe } from "@/lib/perfil";
import { cn } from "@/lib/utils";
import { FotoPerfil, PersonaChip } from "./piezas";
import type { Companero, MarcaDesignada, Relaciones } from "./relaciones";

/** Una fila "etiqueta → contenido" de la ficha. */
export function Fila({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-start sm:gap-3", className)}>
      <span className="pt-1 text-[13px] text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

const nada = (texto: string) => <span className="pt-1 text-[13px] text-muted-foreground">{texto}</span>;

/** Varias personas tocables; si son muchas, las primeras y "y N más". */
export function Gente({ personas, onPersona, max = 8, detalle }: { personas: Persona[]; onPersona?: (id: string) => void; max?: number; detalle?: (p: Persona) => string | undefined }) {
  const [todas, setTodas] = useState(false);
  const visibles = todas ? personas : personas.slice(0, max);
  return (
    <>
      {visibles.map((x) => (
        <PersonaChip
          key={x.id}
          nombre={nombreDe(x.perfil, x.nombre)}
          url={x.avatar_url}
          fuera={Boolean(fueraDeOficina(x.perfil))}
          detalle={detalle?.(x)}
          onClick={onPersona && (() => onPersona(x.id))}
        />
      ))}
      {personas.length > visibles.length && (
        <button type="button" onClick={() => setTodas(true)} className="h-8 rounded-full px-2 text-[13px] font-medium text-muted-foreground hover:text-foreground">
          y {personas.length - visibles.length} más
        </button>
      )}
    </>
  );
}

/**
 * Lo del Board de una persona: qué hace, dónde está y sus marcas (principales y secundarias). `propio`:
 * el texto le habla a quien mira (su perfil).
 */
export function EnElEstudio({
  rel,
  propio = false,
  onPersona,
  accionMarcas,
}: {
  rel: Relaciones;
  propio?: boolean;
  onPersona?: (id: string) => void;
  /** Al lado de las marcas (ej: "Principales y secundarias"). */
  accionMarcas?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <Fila label="Puesto">
        {rel.puestos.length ? rel.puestos.map((x) => <Chip key={x.id} tono="fuerte">{x.nombre}</Chip>) : nada(propio ? "Sin puesto todavía: lo carga un admin" : "Sin puesto todavía")}
      </Fila>
      {rel.sectores.length > 0 && (
        <Fila label={rel.sectores.length === 1 ? "Sector" : "Sectores"}>
          {rel.sectores.map((s) => (
            <Chip key={s.id}>{s.nombre}</Chip>
          ))}
        </Fila>
      )}
      <Fila label={rel.hub?.tipo === "cliente" ? "Equipo" : "Hub"}>
        {rel.hub ? (
          <>
            <Chip>{rel.hub.nombre}</Chip>
            {rel.lideresHub.length > 0 && (
              <>
                <span className="text-[13px] text-muted-foreground">dirigido por</span>
                <Gente personas={rel.lideresHub} onPersona={onPersona} />
              </>
            )}
          </>
        ) : (
          nada("Ninguno")
        )}
      </Fila>
      {rel.dirige.length > 0 && (
        <Fila label="Dirige">
          {rel.dirige.map((h) => (
            <Chip key={h.id}>{h.tipo === "cliente" ? h.nombre : `Hub ${h.nombre}`}</Chip>
          ))}
        </Fila>
      )}
      <Fila label="Depende de">{rel.jefes.length ? <Gente personas={rel.jefes} onPersona={onPersona} /> : nada("Nadie")}</Fila>
      {rel.aCargo.length > 0 && (
        <Fila label="A cargo">
          <Gente personas={rel.aCargo} onPersona={onPersona} max={6} />
        </Fila>
      )}
      <Fila label="Principales">
        {rel.marcas.map((m) => (
          <MarcaChip key={m.brandId} marca={m} title={`Designado en ${m.sectores.join(", ")}`} />
        ))}
        {!rel.marcas.length && nada(propio ? "Todavía no elegiste" : "Ninguna")}
        {accionMarcas}
      </Fila>
      {(rel.secundarias.length > 0 || propio) && (
        <Fila label="Secundarias">
          {rel.secundarias.map((m) => (
            <MarcaChip key={m.brandId} marca={m} title={`También la trabaja en ${m.sectores.join(", ")}`} suave />
          ))}
          {!rel.secundarias.length && nada("Ninguna")}
        </Fila>
      )}
    </div>
  );
}

function MarcaChip({ marca: m, title, suave = false }: { marca: MarcaDesignada; title: string; suave?: boolean }) {
  return (
    <span title={title} className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5", suave ? "border-dashed bg-transparent" : "bg-card")}>
      {m.brand ? <ClientMark brand={m.brand} className="h-6 w-6 rounded-full text-[9px]" pad="p-[18%]" /> : <span className="h-6 w-6 rounded-full bg-secondary" />}
      <span className="truncate text-[13px] font-medium">{m.nombre}</span>
      <span className="truncate text-[11px] text-muted-foreground">{m.sectores.join(", ")}</span>
    </span>
  );
}

/** Con quién trabaja: cada compañero, tocable, con el porqué. */
export function Companeros({ companeros, onPersona, vacio }: { companeros: Companero[]; onPersona?: (id: string) => void; vacio: string }) {
  const [todos, setTodos] = useState(false);
  if (!companeros.length) return <p className="rounded-2xl border border-dashed border-foreground/15 px-4 py-5 text-center text-sm text-muted-foreground">{vacio}</p>;
  const visibles = todos ? companeros : companeros.slice(0, 12);
  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-2">
        {visibles.map(({ persona: x, motivos }) => {
          const fuera = fueraDeOficina(x.perfil);
          return (
            <li key={x.id}>
              <button
                type="button"
                onClick={onPersona && (() => onPersona(x.id))}
                className="flex w-full items-center gap-3 rounded-2xl border bg-card p-2.5 text-left transition-colors hover:border-foreground/25 hover:bg-secondary/40"
              >
                <PersonaFoto persona={x} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{nombreDe(x.perfil, x.nombre)}</span>
                    {fuera && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-900">fuera</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{motivos.join(" · ")}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {companeros.length > visibles.length && (
        <button type="button" onClick={() => setTodos(true)} className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Ver {companeros.length - visibles.length} más
        </button>
      )}
    </div>
  );
}

function PersonaFoto({ persona }: { persona: Persona }) {
  return (
    <FotoPerfil
      nombre={nombreDe(persona.perfil, persona.nombre)}
      url={persona.avatar_url}
      acento={persona.perfil?.acento}
      fuera={Boolean(fueraDeOficina(persona.perfil))}
      size={36}
    />
  );
}
