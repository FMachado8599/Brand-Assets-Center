"use client";

import { useCallback, useEffect, useState } from "react";
// Solo tipos: el navegador no carga nada del servidor.
import type { EventoEstudio, Feriado } from "@/lib/integraciones/calendario";
import { supabase } from "@/lib/supabase";

export type { EventoEstudio, Feriado };

/* ───────────── Fechas (AAAA-MM-DD, sin zona: el día de acá) ───────────── */

export const DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

const aIso = (d: Date) => d.toISOString().slice(0, 10);
const desdeIso = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const sumarDias = (iso: string, n: number) => {
  const d = desdeIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aIso(d);
};

/** Las 6 semanas que muestra un mes (de lunes a domingo). mes: 1-12. */
export function grillaDelMes(anio: number, mes: number) {
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  const atras = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const inicio = aIso(new Date(Date.UTC(anio, mes - 1, 1 - atras)));
  const dias = Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  return { dias, desde: dias[0], hasta: dias[41] };
}

export const nombreMes = (anio: number, mes: number) =>
  new Date(Date.UTC(anio, mes - 1, 15)).toLocaleDateString("es-UY", { month: "long", year: "numeric", timeZone: "UTC" });

/** "jueves 28 de noviembre". */
export const fechaLarga = (iso: string) =>
  desdeIso(iso).toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** El día (AAAA-MM-DD) de un inicio de Google: "2026-11-28" o "2026-11-28T10:30:00-03:00". */
export const diaDe = (inicio: string) =>
  inicio.length <= 10 ? inicio : new Date(inicio).toLocaleDateString("en-CA", { timeZone: "America/Montevideo" });

/** "10:30". */
export const horaDe = (inicio: string) =>
  new Date(inicio).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Montevideo" });

/** Los días que ocupa un evento de todo el día (Google pone el fin al día siguiente). */
export function diasDeEvento(e: EventoEstudio) {
  if (!e.todoElDia) return [diaDe(e.inicio)];
  const out: string[] = [];
  for (let d = e.inicio; d < e.fin && out.length < 60; d = sumarDias(d, 1)) out.push(d);
  return out.length ? out : [e.inicio];
}

/* ───────────── Tareas con entrega ───────────── */

export type TareaCal = {
  id: number;
  titulo: string;
  app_url: string | null;
  fecha: string;
  brand_id: string | null;
  proyecto: string | null;
  tablero: string | null;
  etapa: string | null;
  pausada: boolean;
  asignados: number[];
  responsable_id: string | null;
};

/** Las tareas sin terminar que se entregan entre dos días (la entrega de la app manda sobre la de Basecamp). */
export function useTareasRango(desde: string, hasta: string, activo: boolean) {
  const [tareas, setTareas] = useState<TareaCal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    setTareas(null);
    supabase
      .from("board_flujo")
      .select("id, titulo, app_url, vence, entrega, completada, brand_id, proyecto, tablero, etapa, pausada, asignados, responsable_id")
      .eq("completada", false)
      .or(`and(entrega.gte.${desde},entrega.lte.${hasta}),and(entrega.is.null,vence.gte.${desde},vence.lte.${hasta})`)
      .limit(3000)
      .then(({ data, error: e }) => {
        if (!vivo) return;
        if (e) {
          setError(/board_flujo|does not exist|schema cache|42P01/i.test(e.message) ? null : e.message);
          setTareas([]);
          return;
        }
        setError(null);
        type Fila = Omit<TareaCal, "fecha"> & { vence: string | null; entrega: string | null };
        setTareas(
          ((data ?? []) as Fila[])
            .filter((t) => t.etapa !== "finalizada")
            .map((t) => ({
              ...t,
              id: Number(t.id),
              fecha: (t.entrega ?? t.vence)!,
              asignados: (t.asignados ?? []).map(Number),
              pausada: Boolean(t.pausada),
            }))
        );
      });
    return () => {
      vivo = false;
    };
  }, [desde, hasta, activo]);
  return { tareas, error };
}

/* ───────────── El Google Calendar del estudio ───────────── */

export type GoogleRango = {
  conectado: boolean;
  permiso: boolean;
  cuenta?: string | null;
  calendario?: { id: string; nombre: string | null };
  eventos: EventoEstudio[];
  feriados: Feriado[];
};

export function useGoogleRango(desde: string, hasta: string) {
  const [datos, setDatos] = useState<GoogleRango | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/calendario/google?desde=${desde}&hasta=${hasta}`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) {
          setError(body.error ?? `Error ${r.status}`);
          setDatos({ conectado: true, permiso: true, eventos: [], feriados: [] });
        } else {
          setError(null);
          setDatos(body as GoogleRango);
        }
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [desde, hasta, vuelta]);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { datos, error, recargar };
}
