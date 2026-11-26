/**
 * El calendario del Inicio: los feriados de Uruguay (el estudio está en Montevideo), las fechas del
 * marketing y lo que se usa para las cuentas regresivas. Todo se calcula: no hay que cargar nada.
 *
 * Feriados (Ley 16.805 y Ley 17.414):
 *  - Sin trabajo: 1 de enero, 1 de mayo, 18 de julio, 25 de agosto y 25 de diciembre.
 *  - Carnaval (lunes y martes) y Turismo (la semana antes de Pascua): salen de la Pascua.
 *  - 6 de enero, 19 de junio y 2 de noviembre: el día que caen.
 *  - 19 de abril, 18 de mayo y 12 de octubre se mueven: si caen martes o miércoles, al lunes anterior;
 *    jueves o viernes, al lunes siguiente. El gobierno a veces decide otra cosa: el aviso es orientativo.
 */

export type DiaEspecial = { fecha: string; nombre: string; tipo: "feriado" | "libre" | "marketing" };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dia = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const mas = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
export function pascua(y: number) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const diaMes = ((h + l - 7 * m + 114) % 31) + 1;
  return dia(y, mes, diaMes);
}

/** Martes o miércoles → el lunes anterior; jueves o viernes → el lunes siguiente. */
function trasladable(d: Date) {
  const w = d.getDay();
  if (w === 2 || w === 3) return mas(d, -(w - 1));
  if (w === 4 || w === 5) return mas(d, 8 - w);
  return d;
}

/** El cuarto jueves de noviembre (Acción de Gracias en EE.UU.): el día siguiente es el Black Friday. */
function cuartoJueves(y: number) {
  const primero = dia(y, 11, 1);
  const hasta = (4 - primero.getDay() + 7) % 7;
  return mas(primero, hasta + 21);
}

/** El cuarto lunes de enero: el día del community manager (#CMAD). */
function cuartoLunesEnero(y: number) {
  const primero = dia(y, 1, 1);
  const hasta = (1 - primero.getDay() + 7) % 7;
  return mas(primero, hasta + 21);
}

export function diasDelAnio(y: number): DiaEspecial[] {
  const p = pascua(y);
  const lista: DiaEspecial[] = [
    { fecha: iso(dia(y, 1, 1)), nombre: "Año Nuevo", tipo: "libre" },
    { fecha: iso(dia(y, 1, 6)), nombre: "Día de Reyes", tipo: "feriado" },
    { fecha: iso(mas(p, -48)), nombre: "Carnaval", tipo: "feriado" },
    { fecha: iso(mas(p, -47)), nombre: "Carnaval", tipo: "feriado" },
    ...[-6, -5, -4, -3, -2].map((n) => ({ fecha: iso(mas(p, n)), nombre: "Semana de Turismo", tipo: "feriado" as const })),
    { fecha: iso(trasladable(dia(y, 4, 19))), nombre: "Desembarco de los 33 Orientales", tipo: "feriado" },
    { fecha: iso(dia(y, 5, 1)), nombre: "Día de los Trabajadores", tipo: "libre" },
    { fecha: iso(trasladable(dia(y, 5, 18))), nombre: "Batalla de Las Piedras", tipo: "feriado" },
    { fecha: iso(dia(y, 6, 19)), nombre: "Natalicio de Artigas", tipo: "feriado" },
    { fecha: iso(dia(y, 7, 18)), nombre: "Jura de la Constitución", tipo: "libre" },
    { fecha: iso(dia(y, 8, 25)), nombre: "Día de la Independencia", tipo: "libre" },
    { fecha: iso(trasladable(dia(y, 10, 12))), nombre: "Día de la Diversidad Cultural", tipo: "feriado" },
    { fecha: iso(dia(y, 11, 2)), nombre: "Día de los Difuntos", tipo: "feriado" },
    { fecha: iso(dia(y, 12, 25)), nombre: "Navidad", tipo: "libre" },
    // El calendario del marketing.
    { fecha: iso(cuartoLunesEnero(y)), nombre: "Día del Community Manager", tipo: "marketing" },
    { fecha: iso(dia(y, 2, 14)), nombre: "San Valentín", tipo: "marketing" },
    { fecha: iso(dia(y, 4, 21)), nombre: "Día de la Creatividad y la Innovación", tipo: "marketing" },
    { fecha: iso(dia(y, 4, 27)), nombre: "Día Mundial del Diseño", tipo: "marketing" },
    { fecha: iso(dia(y, 6, 30)), nombre: "Día de las Redes Sociales", tipo: "marketing" },
    { fecha: iso(dia(y, 7, 17)), nombre: "Día del Emoji", tipo: "marketing" },
    { fecha: iso(mas(cuartoJueves(y), 1)), nombre: "Black Friday", tipo: "marketing" },
    { fecha: iso(mas(cuartoJueves(y), 4)), nombre: "Cyber Monday", tipo: "marketing" },
  ];
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Los días especiales entre dos fechas (AAAA-MM-DD, inclusive). */
export function diasEntre(desde: string, hasta: string): DiaEspecial[] {
  const y0 = Number(desde.slice(0, 4));
  const y1 = Number(hasta.slice(0, 4));
  const todos: DiaEspecial[] = [];
  for (let y = y0; y <= y1; y++) todos.push(...diasDelAnio(y));
  return todos.filter((d) => d.fecha >= desde && d.fecha <= hasta);
}

/** Días enteros entre hoy y una fecha AAAA-MM-DD (0 = hoy). */
export function diasHasta(fecha: string, hoy = new Date()) {
  const [y, m, d] = fecha.split("-").map(Number);
  const objetivo = new Date(y, m - 1, d).getTime();
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  return Math.round((objetivo - base) / 86_400_000);
}

/** El próximo feriado (sin contar el marketing), sin repetir los de varios días: Carnaval cuenta una vez. */
export function proximoFeriado(hoy = new Date()): DiaEspecial | null {
  const desde = iso(hoy);
  const hasta = iso(mas(hoy, 400));
  return diasEntre(desde, hasta).find((d) => d.tipo !== "marketing" && d.fecha > desde) ?? null;
}

export type Cuenta = { id: string; emoji: string; texto: string; dias: number };

/**
 * Las cuentas regresivas del Inicio: al viernes, al próximo feriado y a tus vacaciones (si las
 * cargaste). Ordenadas de la más cercana a la más lejana.
 */
export function cuentasRegresivas(hoy = new Date(), vacaciones?: string | null): Cuenta[] {
  const out: Cuenta[] = [];
  const w = hoy.getDay();
  if (w >= 1 && w <= 4) {
    const n = 5 - w;
    out.push({ id: "viernes", emoji: "🍻", texto: n === 1 ? "Mañana es viernes" : `Faltan ${n} días para el viernes`, dias: n });
  } else if (w === 5) out.push({ id: "viernes", emoji: "🍻", texto: "Hoy es viernes", dias: 0 });

  const feriado = proximoFeriado(hoy);
  if (feriado) {
    const n = diasHasta(feriado.fecha, hoy);
    out.push({ id: "feriado", emoji: "📅", texto: n === 1 ? `Mañana: ${feriado.nombre}` : `${n} días para ${feriado.nombre}`, dias: n });
  }

  if (vacaciones) {
    const n = diasHasta(vacaciones, hoy);
    if (n > 0) out.push({ id: "vacaciones", emoji: "🏖️", texto: n === 1 ? "Mañana arrancan tus vacaciones" : `Faltan ${n} días para tus vacaciones`, dias: n });
    else if (n === 0) out.push({ id: "vacaciones", emoji: "🏖️", texto: "¡Hoy arrancan tus vacaciones!", dias: 0 });
  }
  return out.sort((a, b) => a.dias - b.dias);
}

export const hoyISO = (d = new Date()) => iso(d);
export const sumarDias = (d: Date, n: number) => mas(d, n);
export const aISO = iso;

/** El lunes de la semana de esa fecha (a las 0 h). */
export function lunesDe(d = new Date()) {
  const w = (d.getDay() + 6) % 7;
  return mas(d, -w);
}
