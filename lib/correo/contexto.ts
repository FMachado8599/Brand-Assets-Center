"use client";

import { supabase } from "@/lib/supabase";
import { basecampRepo, ETAPAS_CERRADAS, type TareaCompleta } from "@/lib/plani/basecamp";
import { planiRepo } from "@/lib/plani/repo";
import type { PlaniResumen } from "@/lib/plani/types";
import { fold } from "@/lib/redaccion/text";

/**
 * Lo que hay del cliente de un mail, para tenerlo a mano mientras lo leés: sus tareas abiertas en
 * Basecamp, sus presentaciones de este mes y el que viene, y quién del equipo lleva la marca. Todo sale
 * de lo que la app ya tiene (no se le pregunta nada a Basecamp en el momento). Se recuerda por cliente
 * mientras la página está abierta.
 */

export type Designado = { sector: string; nombre: string; email: string | null };

export type Contexto = {
  tareas: TareaCompleta[];
  presentaciones: PlaniResumen[];
  equipo: Designado[];
};

const cache = new Map<string, Promise<Contexto>>();

async function leerEquipo(brandId: string): Promise<Designado[]> {
  const { data, error } = await supabase
    .from("marca_equipo")
    .select("sector_id, sectores(nombre, orden), equipo(nombre, email)")
    .eq("brand_id", brandId)
    .eq("principal", true);
  // Sin migracion-equipo.sql no hay designados: el bloque del equipo no aparece.
  if (error) return [];
  type Fila = { sector_id: string; sectores: { nombre: string; orden: number } | null; equipo: { nombre: string; email: string | null } | null };
  return ((data ?? []) as unknown as Fila[])
    .filter((f) => f.equipo)
    .sort((a, b) => (a.sectores?.orden ?? 99) - (b.sectores?.orden ?? 99))
    .map((f) => ({ sector: f.sectores?.nombre ?? f.sector_id, nombre: f.equipo!.nombre, email: f.equipo!.email?.toLowerCase() ?? null }));
}

/** Las de este mes y el que viene, y cualquiera que esté esperando al cliente. */
async function leerPresentaciones(brandId: string): Promise<PlaniResumen[]> {
  const { data, error } = await planiRepo.porCliente(brandId);
  if (error) return [];
  const hoy = new Date();
  const este = hoy.getFullYear() * 12 + hoy.getMonth();
  return (data ?? [])
    .filter((p) => {
      const mes = p.anio * 12 + (p.mes - 1);
      return (mes >= este && mes <= este + 1) || p.estado === "cliente";
    })
    .slice(0, 4);
}

export function contextoDe(brandId: string): Promise<Contexto> {
  let p = cache.get(brandId);
  if (!p) {
    p = Promise.all([
      basecampRepo.tareasDeCliente(brandId, 80).then((r) => (r.error ? [] : r.data.filter((t) => !ETAPAS_CERRADAS.has(t.columna?.estado ?? "")))),
      leerPresentaciones(brandId),
      leerEquipo(brandId),
    ]).then(([tareas, presentaciones, equipo]) => ({ tareas, presentaciones, equipo }));
    // Si falla, la próxima vez se vuelve a probar.
    p.catch(() => cache.delete(brandId));
    cache.set(brandId, p);
  }
  return p;
}

/* ───────────── Qué tarea es la del mail ───────────── */

const VACIAS = new Set([
  "para", "por", "con", "sin", "del", "las", "los", "una", "uno", "que", "como", "este", "esta", "esto", "sobre", "entre",
  "hola", "buenas", "buen", "dias", "gracias", "saludos", "envio", "mail", "correo", "favor", "urgente", "consulta",
]);

/** Las palabras que importan de un texto: sin tildes, sin las de relleno, sin los "RE:" y "RV:". */
function palabras(texto: string) {
  return new Set(
    fold(texto.toLowerCase())
      .replace(/^((re|rv|fw|fwd)\s*:\s*)+/g, "")
      .split(/[^a-z0-9ñ]+/)
      .filter((p) => p.length >= 3 && !VACIAS.has(p))
  );
}

/**
 * Las tareas ordenadas por lo parecido que es su título al asunto del mail ("RE: Plani diciembre" →
 * "Plani Diciembre 2026" primero). Las que no se parecen quedan después, la que se movió último primero.
 */
export function ordenarPorAsunto(tareas: TareaCompleta[], asunto: string) {
  const delAsunto = palabras(asunto);
  if (!delAsunto.size) return tareas.map((t) => ({ tarea: t, coincide: false }));
  const puntos = (t: TareaCompleta) => [...palabras(t.titulo)].filter((p) => delAsunto.has(p)).length;
  return tareas
    .map((t, i) => ({ t, i, p: puntos(t) }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map(({ t, p }) => ({ tarea: t, coincide: p > 0 }));
}
