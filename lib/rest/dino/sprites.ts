/**
 * Los dibujos del dino, en pixel art propio: cada "#" es un cuadradito de CELDA × CELDA px del
 * mundo (600 × 150). De cada dibujo salen el Path2D que se pinta y las cajas de choque.
 */
export const CELDA = 2;

const CUERPO = [
  "............########..",
  "...........##.#######.",
  "...........##########.",
  "...........##########.",
  "...........##########.",
  "...........#####......",
  "...........########...",
  "#.........#####.......",
  "#........######.......",
  "##......########......",
  "###....#########.##...",
  "####..##########.#....",
  "################......",
  ".###############......",
  "..##############......",
  "...############.......",
  "....##########........",
  ".....########.........",
];

/** El ojo, para el dino que chocó: se le agranda. */
const CUERPO_CHOCADO = CUERPO.map((fila, i) => (i === 1 || i === 2 ? fila.slice(0, 13) + ".." + fila.slice(15) : fila));

const PATAS_QUIETO = ["......###.###.", "......##....#.", "......#.....#.", "......##....##"];
const PATAS_A = ["......###.###.", "......###...#.", "............#.", "............##"];
const PATAS_B = ["......###.###.", "......#....##.", "......#.......", "......##......"];

const CUERPO_AGACHADO = [
  "..................##########..",
  "#.....#######....##.#########.",
  "##...##########..############.",
  "#############################.",
  ".######################.......",
  "..####################.####...",
  "...###############.##.........",
  "....##########....#...........",
  ".....########.................",
];

const ancho = (filas: string[], w: number) => filas.map((f) => f.padEnd(w, "."));

export const DINO = {
  quieto: [...CUERPO, ...ancho(PATAS_QUIETO, 22)],
  correA: [...CUERPO, ...ancho(PATAS_A, 22)],
  correB: [...CUERPO, ...ancho(PATAS_B, 22)],
  chocado: [...CUERPO_CHOCADO, ...ancho(PATAS_QUIETO, 22)],
  agachadoA: [...CUERPO_AGACHADO, ...ancho(PATAS_A, 30)],
  agachadoB: [...CUERPO_AGACHADO, ...ancho(PATAS_B, 30)],
};

export const CACTUS_CHICO = [
  "...###...",
  "..#####..",
  "..#####..",
  "..#####.#",
  "#.#####.#",
  "#.#####.#",
  "#.#####.#",
  "#.#######",
  "#.######.",
  "#######..",
  ".######..",
  "..#####..",
  "..#####..",
  "..#####..",
  "..#####..",
  "..#####..",
  "..#####..",
];

export const CACTUS_GRANDE = [
  ".....###.....",
  "....#####....",
  "....#####....",
  "....#####....",
  "....#####.##.",
  "##..#####.##.",
  "##..#####.##.",
  "##..#####.##.",
  "##..#####.##.",
  "##..#####.##.",
  "##..########.",
  "##..#######..",
  "#########....",
  ".########....",
  "....#####....",
  "....#####....",
  "....#####....",
  "....#####....",
  "....#####....",
  "....#####....",
  "....#####....",
  "....#####....",
  "....#####....",
  "....#####....",
  "....#####....",
];

export const PAJARO = {
  alasArriba: [
    "........#..............",
    "........##.............",
    "........###............",
    "........####...........",
    "....##..#####..........",
    "...###..######.........",
    "..####..#######........",
    "######################.",
    "......################.",
    ".......##############..",
    "........########.......",
    ".......................",
    ".......................",
    ".......................",
    ".......................",
  ],
  alasAbajo: [
    ".......................",
    ".......................",
    ".......................",
    ".......................",
    "....##.................",
    "...###.................",
    "..####.................",
    "######################.",
    "......################.",
    ".......##############..",
    "........#######........",
    "........######.........",
    "........#####..........",
    "........####...........",
    "........###............",
  ],
};

export const NUBE = [
  "..........######.......",
  "........##......##.....",
  "...#####..........#....",
  "..#................###.",
  ".#....................#",
  "#######################",
];

/** Números y letras de 3 × 5 para el puntaje. */
export const LETRAS: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", "###", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", "..#", "..#", "..#"],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
};

export type Caja = { x: number; y: number; w: number; h: number };

export type Sprite = {
  w: number;
  h: number;
  path: Path2D | null;
  /** Cajas de choque, relativas a la esquina del sprite. */
  cajas: Caja[];
};

/**
 * Del dibujo al sprite: un Path2D con un rectángulo por cada tramo de "#" seguidos y, para
 * los choques, una caja por cada franja de `franja` filas (el ancho que ocupa esa franja,
 * un poco achicado: rozar no cuenta, como en el original).
 */
export function sprite(filas: string[], franja = 5): Sprite {
  const h = filas.length * CELDA;
  const w = Math.max(...filas.map((f) => f.length)) * CELDA;
  const path = typeof Path2D === "undefined" ? null : new Path2D();
  filas.forEach((fila, y) => {
    for (let x = 0; x < fila.length; x++) {
      if (fila[x] !== "#") continue;
      let fin = x;
      while (fila[fin + 1] === "#") fin++;
      path?.rect(x * CELDA, y * CELDA, (fin - x + 1) * CELDA, CELDA);
      x = fin;
    }
  });

  const cajas: Caja[] = [];
  for (let desde = 0; desde < filas.length; desde += franja) {
    const tramo = filas.slice(desde, desde + franja);
    let min = Infinity;
    let max = -Infinity;
    let arriba = -1;
    let abajo = -1;
    tramo.forEach((fila, i) => {
      const a = fila.indexOf("#");
      if (a < 0) return;
      min = Math.min(min, a);
      max = Math.max(max, fila.lastIndexOf("#"));
      if (arriba < 0) arriba = i;
      abajo = i;
    });
    if (arriba < 0) continue;
    const caja = {
      x: min * CELDA + 2,
      y: (desde + arriba) * CELDA + 1,
      w: (max - min + 1) * CELDA - 4,
      h: (abajo - arriba + 1) * CELDA - 2,
    };
    if (caja.w > 0 && caja.h > 0) cajas.push(caja);
  }
  return { w, h, path, cajas };
}
