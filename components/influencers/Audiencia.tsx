"use client";

import type { ReactNode } from "react";
import { corto } from "@/lib/influencity/tipos";

/**
 * Lo más útil del análisis de audiencia que guarda Influencity en el detalle del perfil. Los datos
 * llegan como { key | label | completeName, value }; value puede venir como fracción (0.56) o como
 * porcentaje (56), así que se normaliza.
 */

type Detalle = Record<string, unknown>;

const GENEROS: Record<string, string> = { male: "Hombres", female: "Mujeres", m: "Hombres", f: "Mujeres" };

function pct(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const p = n <= 1 ? n * 100 : n;
  return `${p.toLocaleString("es-UY", { maximumFractionDigits: p < 10 ? 1 : 0 })} %`;
}

function par(x: unknown): { nombre: string; valor: string | null } | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const crudo = o.label ?? o.completeName ?? o.key;
  if (crudo == null || crudo === "") return null;
  const nombre = String(crudo);
  return { nombre: GENEROS[nombre.toLowerCase()] ?? nombre, valor: pct(o.value) };
}

/** Un número, { value }, { min, max } o nada. */
function monto(x: unknown): string | null {
  if (typeof x === "number" && Number.isFinite(x)) return corto(x);
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.value === "number") return corto(o.value);
  if (typeof o.min === "number" && typeof o.max === "number") return `${corto(o.min)} – ${corto(o.max)}`;
  return null;
}

function Fila({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

export function Audiencia({ detalle }: { detalle: Detalle | null }) {
  if (!detalle) return <p className="text-sm text-muted-foreground">Influencity todavía no tiene el detalle de este perfil.</p>;
  const metrics = (detalle.metrics ?? {}) as Detalle;

  const audiencia: [string, unknown][] = [
    ["Género", detalle.audienceTopGender],
    ["Edad", detalle.audienceTopAge],
    ["País", detalle.audienceTopCountry],
    ["Ciudad", detalle.audienceTopCity],
    ["Idioma", detalle.audienceTopLanguage],
    ["Interés", detalle.audienceTopInterest],
    ["Marca afín", detalle.audienceTopBrandAffinity],
  ];
  const filasAudiencia = audiencia.map(([k, v]) => [k, par(v)] as const).filter((x): x is readonly [string, { nombre: string; valor: string | null }] => Boolean(x[1]));

  const promedios: [string, unknown][] = [
    ["Likes por publicación", detalle.avgLikes],
    ["Comentarios por publicación", detalle.avgComments],
    ["Vistas por video", detalle.avgViews],
    ["Reproducciones de Reels", detalle.avgReelsPlays],
    ["Publicaciones", detalle.postNumber],
  ];
  const filasPromedios = promedios.filter(([, v]) => typeof v === "number" && Number.isFinite(v)) as [string, number][];

  const estimados: [string, unknown][] = [
    ["Precio por publicación", metrics.estimatedPrice],
    ["Precio por historia", metrics.estimatedStoryPrice],
    ["CPM estimado", metrics.estimatedCPM],
    ["Vistas estimadas", metrics.estimatedViews],
    ["Vistas de historias", metrics.estimatedStoryViews],
  ];
  const filasEstimados = estimados.map(([k, v]) => [k, monto(v)] as const).filter((x): x is readonly [string, string] => Boolean(x[1]));

  const intereses = Array.isArray(detalle.profileInterests) ? (detalle.profileInterests as unknown[]).filter((x): x is string => typeof x === "string") : [];

  if (!filasAudiencia.length && !filasPromedios.length && !filasEstimados.length && !intereses.length) {
    return <p className="text-sm text-muted-foreground">Sin datos de audiencia todavía. Si el plan lo permite, pedí el análisis.</p>;
  }

  return (
    <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {filasAudiencia.length > 0 && (
        <div>
          <p className="eyebrow text-muted-foreground">Sus seguidores</p>
          <dl className="mt-1 divide-y">
            {filasAudiencia.map(([k, v]) => (
              <Fila key={k} label={k}>
                {v.nombre}
                {v.valor && <span className="ml-1.5 font-normal text-muted-foreground">{v.valor}</span>}
              </Fila>
            ))}
          </dl>
        </div>
      )}
      <div className="space-y-4">
        {filasPromedios.length > 0 && (
          <div>
            <p className="eyebrow text-muted-foreground">Promedios</p>
            <dl className="mt-1 divide-y">
              {filasPromedios.map(([k, v]) => (
                <Fila key={k} label={k}>
                  {corto(v)}
                </Fila>
              ))}
            </dl>
          </div>
        )}
        {filasEstimados.length > 0 && (
          <div>
            <p className="eyebrow text-muted-foreground">Estimaciones de Influencity</p>
            <dl className="mt-1 divide-y">
              {filasEstimados.map(([k, v]) => (
                <Fila key={k} label={k}>
                  {v}
                </Fila>
              ))}
            </dl>
          </div>
        )}
        {intereses.length > 0 && (
          <div>
            <p className="eyebrow text-muted-foreground">De qué habla</p>
            <p className="mt-1.5 flex flex-wrap gap-1">
              {intereses.slice(0, 10).map((i) => (
                <span key={i} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                  {i}
                </span>
              ))}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
