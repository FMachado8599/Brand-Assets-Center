import { DIAS, MESES } from "./config";

/**
 * Las fechas de una plani son días de calendario ("2026-10-01"), sin hora ni zona: así el jueves 1
 * es el jueves 1 en cualquier computadora. Nunca se pasan por new Date("2026-10-01"), que las
 * interpreta en UTC y en Uruguay da el día anterior.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export const isoDe = (anio: number, mes: number, dia: number) => `${anio}-${pad(mes)}-${pad(dia)}`;

export function partes(fecha: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  return { anio: y, mes: m, dia: d };
}

/** La fecha como Date a las 12 del mediodía local (lejos de cualquier cambio de día). */
export function aDate(fecha: string) {
  const { anio, mes, dia } = partes(fecha);
  return new Date(anio, mes - 1, dia, 12);
}

export function hoyISO() {
  const d = new Date();
  return isoDe(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export const diasDelMes = (anio: number, mes: number) => new Date(anio, mes, 0).getDate();

/** "Jueves 1" */
export function etiquetaDia(fecha: string) {
  return `${DIAS[aDate(fecha).getDay()]} ${partes(fecha).dia}`;
}

/** "Jue 1" */
export function etiquetaCorta(fecha: string) {
  return `${DIAS[aDate(fecha).getDay()].slice(0, 3)} ${partes(fecha).dia}`;
}

/** "Octubre 2026" */
export const nombreMes = (anio: number, mes: number) => `${MESES[mes - 1]} ${anio}`;

/** "01-10" para nombrar carpetas y archivos en orden. */
export function etiquetaArchivo(fecha: string) {
  const { mes, dia } = partes(fecha);
  return `${pad(dia)}-${pad(mes)}`;
}

/**
 * Las semanas del mes, de lunes a domingo, como en la plani de siempre. Los días que no son del
 * mes quedan en null (la grilla los deja vacíos).
 */
export function semanasDelMes(anio: number, mes: number): (string | null)[][] {
  const total = diasDelMes(anio, mes);
  // getDay(): 0 = domingo. Corrido para que el lunes sea la primera columna.
  const offset = (new Date(anio, mes - 1, 1).getDay() + 6) % 7;
  const celdas: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, i) => isoDe(anio, mes, i + 1)),
  ];
  while (celdas.length % 7) celdas.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

/** La fecha está dentro del mes de la plani. */
export function enElMes(fecha: string, anio: number, mes: number) {
  const p = partes(fecha);
  return p.anio === anio && p.mes === mes;
}

/** El primer día hábil del mes que todavía no tiene nada (para sugerir dónde va una pieza nueva). */
export function primerDiaLibre(anio: number, mes: number, ocupadas: Set<string>) {
  const total = diasDelMes(anio, mes);
  for (let d = 1; d <= total; d++) {
    const f = isoDe(anio, mes, d);
    const dow = aDate(f).getDay();
    if (dow !== 0 && dow !== 6 && !ocupadas.has(f)) return f;
  }
  return isoDe(anio, mes, 1);
}

/** "14:30:00" → "14:30" */
export const horaCorta = (hora: string | null) => (hora ? hora.slice(0, 5) : "");
