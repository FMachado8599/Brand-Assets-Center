import { createSupabaseAnon } from "@/lib/supabase-server";
import { hasSecret } from "@/lib/integraciones/crypto";
import { llaveServidor } from "@/lib/integraciones/llave-servidor";
import { Slack } from "@/lib/integraciones/slack";
import {
  avisoCumpleCompanero,
  avisoCumplePropio,
  avisoEstudio,
  avisosCliente,
  notificacion,
  resumen,
  type Cumpleanero,
  type Fuera,
  type ItemCliente,
  type ItemNotificacion,
  type TareaResumen,
} from "./mensajes";

/**
 * Lo que manda el bot sin que nadie lo pida en el momento. Corre en el servidor, sin sesión: se
 * identifica ante la base con la llave del servidor (uso "slack").
 *  - despacharCola: las menciones y asignaciones de quien las pidió, y lo que hace el cliente en la
 *    presentación compartida. Lo llaman los avisos de Basecamp, la página del cliente, la app después
 *    de un cambio y la tarea de la mañana.
 *  - avisosDelDia: los cumpleaños, quién está fuera de oficina y el resumen de cada uno. Lo corre la
 *    tarea de la mañana (vercel.json); repetirla el mismo día no duplica nada (slack_marcar).
 */

/** La zona del estudio: "hoy" es hoy en Montevideo, no en el servidor. */
export const ZONA = process.env.APP_TIMEZONE || "America/Montevideo";

/** Hoy en la zona del estudio, como AAAA-MM-DD (y el día siguiente). */
export function hoyEnZona(ahora = new Date()) {
  const hoy = ahora.toLocaleDateString("en-CA", { timeZone: ZONA });
  const [y, m, d] = hoy.split("-").map(Number);
  const manana = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const diaSemana = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { hoy, manana, finDeSemana: diaSemana === 0 || diaSemana === 6 };
}

const llave = () => llaveServidor("slack");

export type ResultadoCola = { enviados: number; fallas: number; sinConexion?: boolean };

/** Manda lo que hay en la cola (hasta 40 por vez). Nunca tira: devuelve cuántos salieron. */
export async function despacharCola(origen: string): Promise<ResultadoCola> {
  if (!hasSecret()) return { enviados: 0, fallas: 0, sinConexion: true };
  const slack = await Slack.desdeServidor();
  if (!slack) return { enviados: 0, fallas: 0, sinConexion: true };
  const db = createSupabaseAnon();
  const { data, error } = await db.rpc("slack_cola_tomar", { p_llave: llave(), p_limite: 40 });
  if (error) return { enviados: 0, fallas: 1 };
  const items = (data ?? []) as (ItemNotificacion | ItemCliente)[];
  if (!items.length) return { enviados: 0, fallas: 0 };

  const ok: number[] = [];
  const errores: Record<string, string> = {};

  // Las notificaciones, una por una (cada una a su persona).
  for (const n of items.filter((i): i is ItemNotificacion => i.tipo === "notificacion")) {
    try {
      await slack.privado(n.slack_id, notificacion(n, origen));
      ok.push(n.id);
    } catch (e) {
      errores[n.id] = (e as Error).message;
    }
  }

  // Lo del cliente, junto por presentación (si aprobó 12 piezas seguidas, sale un solo mensaje).
  const porPresentacion = new Map<string, ItemCliente[]>();
  for (const c of items.filter((i): i is ItemCliente => i.tipo === "cliente")) {
    const k = `${c.canal_id}:${c.presentacion_id}`;
    porPresentacion.set(k, [...(porPresentacion.get(k) ?? []), c]);
  }
  for (const grupo of porPresentacion.values()) {
    try {
      await slack.postear(grupo[0].canal_id, avisosCliente(grupo, origen));
      ok.push(...grupo.map((g) => g.id));
    } catch (e) {
      for (const g of grupo) errores[g.id] = (e as Error).message;
    }
  }

  await db.rpc("slack_cola_terminar", { p_llave: llave(), p_ok: ok, p_errores: errores });
  return { enviados: ok.length, fallas: Object.keys(errores).length };
}

/** Despacha la cola sin frenar a quien llama (los errores se tragan: un aviso nunca rompe nada). */
export async function despacharColaSinFallar(origen: string) {
  try {
    return await despacharCola(origen);
  } catch {
    return { enviados: 0, fallas: 1 };
  }
}

type Dia = {
  cumples: (Cumpleanero & { companeros: Cumpleanero[] })[];
  fuera: Fuera[];
  resumen: (Cumpleanero & { tareas: TareaResumen[] })[];
};

export type ResultadoDia = {
  fecha: string;
  estudio: boolean;
  cumples: number;
  saludos: number;
  resumenes: number;
  cola: ResultadoCola;
  errores: string[];
  sinConexion?: boolean;
};

/** Lo del día: el aviso en el canal del estudio, los privados de los cumpleaños y los resúmenes. */
export async function avisosDelDia(origen: string, ahora = new Date()): Promise<ResultadoDia> {
  const { hoy, manana, finDeSemana } = hoyEnZona(ahora);
  const vacio: ResultadoDia = { fecha: hoy, estudio: false, cumples: 0, saludos: 0, resumenes: 0, cola: { enviados: 0, fallas: 0 }, errores: [] };
  const slack = hasSecret() ? await Slack.desdeServidor() : null;
  if (!slack) return { ...vacio, sinConexion: true };

  const db = createSupabaseAnon();
  const { data, error } = await db.rpc("slack_dia_servidor", { p_llave: llave(), p_fecha: hoy });
  if (error) return { ...vacio, errores: [error.message] };
  const dia = data as Dia;
  const out = { ...vacio, cumples: dia.cumples.length };

  // Cada envío tiene su clave del día: solo sale lo que todavía no salió. Si falla, se libera.
  type Envio = { clave: string; mandar: () => Promise<unknown>; tipo: "estudio" | "saludo" | "resumen" };
  const envios: Envio[] = [];
  const canal = slack.datos.canal_estudio?.id;
  if (canal && (dia.cumples.length || dia.fuera.length)) {
    envios.push({ clave: `estudio:${hoy}`, tipo: "estudio", mandar: () => slack.postear(canal, avisoEstudio(dia.cumples, dia.fuera, hoy, ZONA)) });
  }
  for (const c of dia.cumples) {
    if (c.slack_id) envios.push({ clave: `cumple:${hoy}:${c.persona_id}:propio`, tipo: "saludo", mandar: () => slack.privado(c.slack_id!, avisoCumplePropio(c)) });
    for (const o of c.companeros) {
      if (!o.slack_id) continue;
      envios.push({ clave: `cumple:${hoy}:${c.persona_id}:${o.persona_id}`, tipo: "saludo", mandar: () => slack.privado(o.slack_id!, avisoCumpleCompanero(c, origen)) });
    }
  }
  // El resumen, solo los días de semana y si hay algo.
  if (!finDeSemana) {
    for (const r of dia.resumen) {
      if (!r.slack_id || !r.tareas.length) continue;
      envios.push({ clave: `resumen:${hoy}:${r.persona_id}`, tipo: "resumen", mandar: () => slack.privado(r.slack_id!, resumen(r.nombre, r.tareas, hoy, manana, origen, ZONA)) });
    }
  }

  if (envios.length) {
    const { data: nuevas, error: e } = await db.rpc("slack_marcar", { p_llave: llave(), p_claves: envios.map((x) => x.clave) });
    if (e) return { ...out, errores: [e.message] };
    const tocan = new Set((nuevas ?? []) as string[]);
    const fallidas: string[] = [];
    await enParalelo(envios.filter((x) => tocan.has(x.clave)), 4, async (envio) => {
      try {
        await envio.mandar();
        if (envio.tipo === "estudio") out.estudio = true;
        else if (envio.tipo === "saludo") out.saludos++;
        else out.resumenes++;
      } catch (err) {
        fallidas.push(envio.clave);
        out.errores.push((err as Error).message);
      }
    });
    if (fallidas.length) await db.rpc("slack_desmarcar", { p_llave: llave(), p_claves: fallidas });
  }

  out.cola = await despacharColaSinFallar(origen);
  return out;
}

/** Corre las tareas de a `n` a la vez (Slack aguanta varios privados en paralelo, no cientos). */
async function enParalelo<T>(lista: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const trabajador = async () => {
    while (i < lista.length) await fn(lista[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, trabajador));
}
