/** Los juegos de Rest. Los ids y los modos son los mismos que valida la base (supabase/migracion-juegos.sql). */
export type JuegoId = "dino" | "buscaminas" | "viborita" | "fusion" | "paleta";
export type Dificultad = "principiante" | "intermedio" | "experto";
export type Periodo = "semana" | "siempre";

export type Juego = {
  id: JuegoId;
  href: string;
  nombre: string;
  bajada: string;
  /** Cómo se juega, en una línea. */
  controles: string;
  /** El buscaminas gana con menos tiempo; los demás, con más puntos. */
  gana: "mas" | "menos";
};

export const JUEGOS: Juego[] = [
  {
    id: "dino",
    href: "/rest/dino",
    nombre: "Dino",
    bajada: "Saltá los cactus y agachate ante los pájaros. Cada vez más rápido.",
    controles: "Espacio o ↑ para saltar, ↓ para agacharte. En el celular, tocá.",
    gana: "mas",
  },
  {
    id: "buscaminas",
    href: "/rest/buscaminas",
    nombre: "Buscaminas",
    bajada: "Despejá el tablero sin pisar una mina, en el menor tiempo posible.",
    controles: "Click para abrir, click derecho para la bandera. En el celular, mantené apretado.",
    gana: "menos",
  },
  {
    id: "viborita",
    href: "/rest/viborita",
    nombre: "Viborita",
    bajada: "Comé frutas, crecé y no te choques: ni con los bordes ni con tu propia cola.",
    controles: "Flechas o WASD para doblar, Espacio para pausar. En el celular, deslizá el dedo.",
    gana: "mas",
  },
  {
    id: "fusion",
    href: "/rest/fusion",
    nombre: "Fusión",
    bajada: "Juntá fichas iguales hasta llegar a 2048. Cada fusión suma al puntaje.",
    controles: "Flechas o WASD para deslizar las fichas; en el celular, deslizá el dedo. «Nueva partida» guarda lo que llevás.",
    gana: "mas",
  },
  {
    id: "paleta",
    href: "/rest/paleta",
    nombre: "Paleta",
    bajada: "¿De quién es esta paleta? Adiviná la marca del estudio por sus colores, contra reloj.",
    controles: "Click en la marca, o las teclas 1 a 4. Equivocarse cuesta 2 segundos. Espacio para arrancar.",
    gana: "mas",
  },
];

export const juego = (id: JuegoId) => JUEGOS.find((j) => j.id === id)!;

export const DIFICULTADES: { value: Dificultad; label: string; cols: number; rows: number; minas: number }[] = [
  { value: "principiante", label: "Principiante", cols: 9, rows: 9, minas: 10 },
  { value: "intermedio", label: "Intermedio", cols: 16, rows: 16, minas: 40 },
  { value: "experto", label: "Experto", cols: 30, rows: 16, minas: 99 },
];

export const dificultad = (value: Dificultad) => DIFICULTADES.find((d) => d.value === value) ?? DIFICULTADES[0];

/** Un tiempo del buscaminas: "8,42 s", "1:05,30". */
export function formatTiempo(ms: number) {
  const total = Math.max(0, ms) / 1000;
  const min = Math.floor(total / 60);
  const seg = (total - min * 60).toFixed(2).replace(".", ",");
  return min ? `${min}:${seg.padStart(5, "0")}` : `${seg} s`;
}

/** El puntaje de cada juego como se muestra en el ranking. */
export function formatPuntaje(id: JuegoId, puntaje: number) {
  return id === "buscaminas" ? formatTiempo(puntaje) : puntaje.toLocaleString("es-UY");
}
