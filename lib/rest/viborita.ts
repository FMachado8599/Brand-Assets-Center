import { DELTA, OPUESTA, type Dir } from "./teclado";

/**
 * La viborita, sin React: una grilla, una víbora que avanza una celda por paso y una fruta.
 * Cada paso devuelve una víbora nueva (no modifica la anterior). Chocar contra el borde o
 * contra el propio cuerpo termina la partida.
 */

export const COLS = 24;
export const FILAS = 16;
const LARGO_INICIAL = 3;
/** Lo más que se puede comer: hasta llenar la grilla. */
export const MAX_FRUTAS = COLS * FILAS - LARGO_INICIAL;

/**
 * Cada cuánto avanza una celda: arranca en 140 ms y con cada fruta va 2,5 ms más rápido, hasta 65 ms.
 * A ese ritmo no se pueden comer más de 1000 / 65 ≈ 15,4 frutas por segundo: la base no acepta
 * más de 16 por segundo jugado (juego_puntaje_valido, migracion-juegos.sql).
 */
export const intervalo = (frutas: number) => Math.max(65, 140 - frutas * 2.5);

export type Vibora = {
  /** Las celdas (fila × COLS + columna), de la cabeza a la cola. */
  cuerpo: number[];
  dir: Dir;
  fruta: number | null;
  frutas: number;
  /** Cómo terminó: chocó, o llenó la grilla y no hay dónde poner otra fruta. */
  fin: "choque" | "llena" | null;
};

export const celda = (i: number) => ({ x: i % COLS, y: Math.floor(i / COLS) });

/** Arranca a la izquierda, mirando a la derecha, con la primera fruta adelante (siempre igual: no rompe la hidratación). */
export function nuevaVibora(): Vibora {
  const y = Math.floor(FILAS / 2);
  const cabeza = y * COLS + 6;
  return {
    cuerpo: Array.from({ length: LARGO_INICIAL }, (_, k) => cabeza - k),
    dir: "derecha",
    fruta: y * COLS + 16,
    frutas: 0,
    fin: null,
  };
}

/** Una celda libre al azar (null si la víbora ocupa toda la grilla). */
function sortearFruta(cuerpo: number[]): number | null {
  const ocupadas = new Set(cuerpo);
  const libres: number[] = [];
  for (let i = 0; i < COLS * FILAS; i++) if (!ocupadas.has(i)) libres.push(i);
  return libres.length ? libres[Math.floor(Math.random() * libres.length)] : null;
}

/** Avanza una celda hacia dir (si dir es la contraria, sigue derecho: no se puede dar vuelta sobre sí misma). */
export function avanzar(v: Vibora, pedida: Dir): Vibora {
  if (v.fin) return v;
  const dir = pedida === OPUESTA[v.dir] ? v.dir : pedida;
  const { x, y } = celda(v.cuerpo[0]);
  const nx = x + DELTA[dir][0];
  const ny = y + DELTA[dir][1];
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= FILAS) return { ...v, dir, fin: "choque" };

  const cabeza = ny * COLS + nx;
  const come = cabeza === v.fruta;
  // La cola se corre en el mismo paso: se puede ir a la celda que deja libre, salvo que esté creciendo.
  const resto = come ? v.cuerpo : v.cuerpo.slice(0, -1);
  if (resto.includes(cabeza)) return { ...v, dir, fin: "choque" };

  const cuerpo = [cabeza, ...resto];
  if (!come) return { ...v, dir, cuerpo };
  const fruta = sortearFruta(cuerpo);
  return { ...v, dir, cuerpo, frutas: v.frutas + 1, fruta, fin: fruta === null ? "llena" : null };
}
