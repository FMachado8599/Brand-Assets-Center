/** Lo que comparten los juegos de Rest para leer el teclado y el dedo. */

export type Dir = "arriba" | "abajo" | "izquierda" | "derecha";

export const OPUESTA: Record<Dir, Dir> = { arriba: "abajo", abajo: "arriba", izquierda: "derecha", derecha: "izquierda" };

/** [columnas, filas] que avanza cada dirección. */
export const DELTA: Record<Dir, [number, number]> = { arriba: [0, -1], abajo: [0, 1], izquierda: [-1, 0], derecha: [1, 0] };

const TECLAS: Record<string, Dir> = {
  ArrowUp: "arriba",
  KeyW: "arriba",
  ArrowDown: "abajo",
  KeyS: "abajo",
  ArrowLeft: "izquierda",
  KeyA: "izquierda",
  ArrowRight: "derecha",
  KeyD: "derecha",
};

/** La dirección de una flecha o de WASD (null si es otra tecla, o si viene con Cmd, Ctrl o Alt). */
export function dirDeTecla(e: KeyboardEvent): Dir | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  return TECLAS[e.code] ?? null;
}

/** Escribiendo o con el foco en otro control: ahí las teclas son de ese control, salvo en plena partida. */
export function esDeOtro(target: EventTarget | null): "escribiendo" | "control" | false {
  const el = target as HTMLElement | null;
  if (!el || el === document.body) return false;
  if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return "escribiendo";
  return el.closest("button, a, [role=tab], [role=menuitem]") ? "control" : false;
}

/** Cuánto hay que deslizar el dedo para que cuente como un movimiento. */
export const DESLIZ_PX = 24;

/** La dirección de un deslizamiento (null si fue muy corto: un toque). */
export function dirDeDesliz(dx: number, dy: number, minimo = DESLIZ_PX): Dir | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < minimo) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "derecha" : "izquierda";
  return dy > 0 ? "abajo" : "arriba";
}
