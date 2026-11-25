import type { Dir } from "./teclado";

/**
 * Fusión, sin React: un tablero de 4 × 4 donde cada jugada desliza todas las fichas hacia un lado.
 * Dos fichas iguales que chocan se juntan en una del doble y eso suma al puntaje. Después de cada
 * jugada que mueve algo aparece una ficha nueva (un 2, o a veces un 4). Termina cuando el tablero
 * se llena y no queda ninguna jugada.
 */

export const LADO = 4;
export const META = 2048;

/**
 * Entre una jugada y la siguiente pasan al menos 80 ms (lo que dura el deslizamiento): como mucho
 * 12,5 jugadas por segundo. La base usa ese tope para descartar puntajes imposibles
 * (juego_puntaje_valido, migracion-juegos.sql).
 */
export const PAUSA_MS = 80;

export type Ficha = {
  id: number;
  valor: number;
  fila: number;
  col: number;
  /** Apareció en la última jugada. */
  nueva?: boolean;
  /** Nació de juntar dos en la última jugada. */
  fusion?: boolean;
  /** Se juntó con otra en la última jugada: se desliza hasta su lugar y se va en la siguiente. */
  absorbida?: boolean;
};

export type Tablero = {
  fichas: Ficha[];
  puntaje: number;
  /** El id de la próxima ficha. */
  sig: number;
  /** Ya se llegó a 2048 (se avisa una sola vez). */
  llego: boolean;
  /** No queda ninguna jugada. */
  fin: boolean;
};

export const tableroVacio = (): Tablero => ({ fichas: [], puntaje: 0, sig: 1, llego: false, fin: false });

/** Las fichas que están en juego (las absorbidas solo quedan para la animación). */
export const enJuego = (t: Tablero) => t.fichas.filter((f) => !f.absorbida);

function ponerAlAzar(fichas: Ficha[], id: number): Ficha | null {
  const ocupadas = new Set(fichas.map((f) => f.fila * LADO + f.col));
  const libres: number[] = [];
  for (let i = 0; i < LADO * LADO; i++) if (!ocupadas.has(i)) libres.push(i);
  if (!libres.length) return null;
  const i = libres[Math.floor(Math.random() * libres.length)];
  return { id, valor: Math.random() < 0.9 ? 2 : 4, fila: Math.floor(i / LADO), col: i % LADO, nueva: true };
}

/** Un tablero para arrancar, con dos fichas al azar. */
export function arrancar(): Tablero {
  const fichas: Ficha[] = [];
  for (let id = 1; id <= 2; id++) {
    const f = ponerAlAzar(fichas, id);
    if (f) fichas.push(f);
  }
  return { ...tableroVacio(), fichas, sig: 3 };
}

/** La casilla k (contando desde el borde hacia el que se desliza) de la línea l. */
function casilla(dir: Dir, l: number, k: number): [number, number] {
  switch (dir) {
    case "izquierda":
      return [l, k];
    case "derecha":
      return [l, LADO - 1 - k];
    case "arriba":
      return [k, l];
    case "abajo":
      return [LADO - 1 - k, l];
  }
}

function quedanJugadas(fichas: Ficha[]) {
  if (fichas.length < LADO * LADO) return true;
  const valor = new Map(fichas.map((f) => [f.fila * LADO + f.col, f.valor]));
  for (let fila = 0; fila < LADO; fila++) {
    for (let col = 0; col < LADO; col++) {
      const v = valor.get(fila * LADO + col);
      if (col + 1 < LADO && valor.get(fila * LADO + col + 1) === v) return true;
      if (fila + 1 < LADO && valor.get((fila + 1) * LADO + col) === v) return true;
    }
  }
  return false;
}

/**
 * Desliza todo hacia dir. Cada ficha se junta como mucho una vez por jugada, y se junta primero
 * la que está más cerca del borde: [2, 2, 2, 2] hacia la izquierda da [4, 4, ·, ·].
 * Si nada se mueve, devuelve el mismo tablero (y no aparece ficha nueva).
 */
export function mover(t: Tablero, dir: Dir): Tablero {
  if (t.fin) return t;
  const vivas = enJuego(t).map((f) => ({ ...f, nueva: false, fusion: false }));
  const en = new Map(vivas.map((f) => [f.fila * LADO + f.col, f]));
  const nacidas: Ficha[] = [];
  let sig = t.sig;
  let suma = 0;
  let movio = false;

  for (let l = 0; l < LADO; l++) {
    let lugar = -1;
    /** La última ficha que quedó en la línea, y si todavía se puede juntar. */
    let ultima: { ficha: Ficha; libre: boolean } | null = null;
    for (let k = 0; k < LADO; k++) {
      const [fila, col] = casilla(dir, l, k);
      const f = en.get(fila * LADO + col);
      if (!f) continue;
      if (ultima?.libre && ultima.ficha.valor === f.valor) {
        const destino = ultima.ficha;
        f.fila = destino.fila;
        f.col = destino.col;
        f.absorbida = true;
        destino.absorbida = true;
        const junta: Ficha = { id: sig++, valor: f.valor * 2, fila: destino.fila, col: destino.col, fusion: true };
        nacidas.push(junta);
        ultima = { ficha: junta, libre: false };
        suma += junta.valor;
        movio = true;
      } else {
        lugar++;
        const [nf, nc] = casilla(dir, l, lugar);
        if (f.fila !== nf || f.col !== nc) movio = true;
        f.fila = nf;
        f.col = nc;
        ultima = { ficha: f, libre: true };
      }
    }
  }

  if (!movio) return t;
  const quedan = [...vivas.filter((f) => !f.absorbida), ...nacidas];
  const nueva = ponerAlAzar(quedan, sig);
  if (nueva) {
    quedan.push(nueva);
    sig++;
  }
  return {
    fichas: [...vivas, ...nacidas, ...(nueva ? [nueva] : [])],
    puntaje: t.puntaje + suma,
    sig,
    llego: t.llego || quedan.some((f) => f.valor >= META),
    fin: !quedanJugadas(quedan),
  };
}

/** La ficha más alta en juego. */
export const maxima = (t: Tablero) => enJuego(t).reduce((m, f) => Math.max(m, f.valor), 0);
