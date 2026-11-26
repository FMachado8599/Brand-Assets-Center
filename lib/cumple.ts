/**
 * Los cumpleaños del equipo (supabase/migracion-cumpleanos.sql): solo el día y el mes. El 29 de
 * febrero, los años que no tienen, se festeja el 28 (igual que cumple_en en la base).
 * Sin dependencias: lo usan el Perfil, Organización, el Calendario y el servidor (Slack, .ics).
 */

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export type Cumple = { dia: number; mes: number };

/** Los días que tiene un mes (febrero, 29: el cumpleaños puede ser el 29). */
export const diasDelMes = (mes: number) => (mes === 2 ? 29 : [4, 6, 9, 11].includes(mes) ? 30 : 31);

export function cumpleValido(dia: number | null | undefined, mes: number | null | undefined): dia is number {
  return typeof dia === "number" && typeof mes === "number" && mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasDelMes(mes);
}

/** De una fila del equipo (cumple_dia, cumple_mes), o null si no lo cargó. */
export function cumpleDe(p: { cumple_dia?: number | null; cumple_mes?: number | null } | null | undefined): Cumple | null {
  const dia = p?.cumple_dia == null ? null : Number(p.cumple_dia);
  const mes = p?.cumple_mes == null ? null : Number(p.cumple_mes);
  return cumpleValido(dia, mes) ? { dia, mes: mes! } : null;
}

const bisiesto = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** El día que se festeja ese año, como AAAA-MM-DD. */
export function cumpleEn(c: Cumple, anio: number) {
  const dia = c.mes === 2 && c.dia === 29 && !bisiesto(anio) ? 28 : c.dia;
  return `${anio}-${String(c.mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** "12 de marzo". */
export const textoCumple = (c: Cumple) => `${c.dia} de ${MESES[c.mes - 1]}`;

/** Hoy (AAAA-MM-DD) es su cumpleaños. */
export const cumpleHoy = (c: Cumple | null, hoy: string) => Boolean(c && cumpleEn(c, Number(hoy.slice(0, 4))) === hoy);

/** Cuántos días faltan para el próximo (0: hoy). */
export function diasParaCumple(c: Cumple, hoy: string) {
  const anio = Number(hoy.slice(0, 4));
  const dia = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  let proximo = cumpleEn(c, anio);
  if (proximo < hoy) proximo = cumpleEn(c, anio + 1);
  return Math.round((dia(proximo) - dia(hoy)) / 86_400_000);
}

/** "Hoy", "Mañana", "En 5 días" o "El 12 de marzo". */
export function cuandoCumple(c: Cumple, hoy: string) {
  const d = diasParaCumple(c, hoy);
  if (d === 0) return "Hoy";
  if (d === 1) return "Mañana";
  if (d < 7) return `En ${d} días`;
  return `El ${textoCumple(c)}`;
}
