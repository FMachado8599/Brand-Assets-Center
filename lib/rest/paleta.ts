import { coloresDe } from "@/lib/inicio/marcas";
import type { Brand } from "@/lib/types";

/**
 * Paleta: "¿de quién es esta paleta?". Se muestran los colores de una marca del estudio y hay que
 * elegirla entre cuatro. En Rest es contrarreloj (45 s, un punto por acierto); en el Inicio, una sola
 * pregunta. La base valida que no haya más de 2,5 aciertos por segundo (supabase/migracion-juegos.sql).
 */

export const DURACION_MS = 45_000;
/** Lo que se muestra la respuesta antes de pasar a la siguiente. */
export const PAUSA_MS = 650;
/** Una equivocación cuesta tiempo: si no, convendría tocar al azar. */
export const CASTIGO_MS = 2_000;
export const OPCIONES = 4;

/** La "firma" de colores de una marca: los que se muestran, sin repetir. */
export const firma = (b: Brand) => coloresDe(b).map((c) => c.hex);

/**
 * Las marcas con las que se puede jugar: las que tienen al menos dos colores (con uno solo es
 * adivinar), sin dos con la misma firma (serían indistinguibles).
 */
export function marcasJugables(brands: Brand[]) {
  const vistas = new Set<string>();
  const out: Brand[] = [];
  for (const b of brands) {
    const f = firma(b);
    if (f.length < 2) continue;
    const clave = f.join("|");
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    out.push(b);
  }
  return out;
}

export type Pregunta = { respuesta: Brand; opciones: Brand[]; colores: string[] };

function mezclar<T>(lista: T[]) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Una pregunta nueva, sin repetir la marca de las últimas. Las opciones falsas pueden ser cualquier
 * cliente (también los que no tienen paleta: igual se reconocen por el nombre).
 */
export function nuevaPregunta(jugables: Brand[], todas: Brand[], recientes: string[] = []): Pregunta | null {
  if (!jugables.length || todas.length < OPCIONES) return null;
  const candidatas = jugables.filter((b) => !recientes.includes(b.id));
  const respuesta = mezclar(candidatas.length ? candidatas : jugables)[0];
  const otras = mezclar(todas.filter((b) => b.id !== respuesta.id)).slice(0, OPCIONES - 1);
  return { respuesta, opciones: mezclar([respuesta, ...otras]), colores: firma(respuesta) };
}
