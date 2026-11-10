/**
 * El buscaminas, sin React: un tablero que no se modifica (cada jugada devuelve uno nuevo).
 * Las minas se siembran recién con el primer click, lejos de esa celda: arrancar nunca explota
 * y siempre abre un pedazo, como en el de Windows.
 */

export type Celda = { mina: boolean; vecinas: number; abierta: boolean; bandera: boolean };
export type EstadoTablero = "listo" | "jugando" | "ganada" | "perdida";

export type Tablero = {
  cols: number;
  rows: number;
  minas: number;
  celdas: Celda[];
  estado: EstadoTablero;
  /** La mina que se pisó. */
  exploto: number | null;
  banderas: number;
  abiertas: number;
};

export function nuevoTablero(cols: number, rows: number, minas: number): Tablero {
  return {
    cols,
    rows,
    minas,
    celdas: Array.from({ length: cols * rows }, () => ({ mina: false, vecinas: 0, abierta: false, bandera: false })),
    estado: "listo",
    exploto: null,
    banderas: 0,
    abiertas: 0,
  };
}

export function vecinos(t: Pick<Tablero, "cols" | "rows">, i: number) {
  const r = Math.floor(i / t.cols);
  const c = i % t.cols;
  const lista: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < t.rows && cc >= 0 && cc < t.cols) lista.push(rr * t.cols + cc);
    }
  }
  return lista;
}

/** Siembra las minas lejos de la primera celda (ni en ella ni alrededor) y cuenta las vecinas. */
function sembrar(t: Tablero, primera: number): Celda[] {
  const lejos = new Set([primera, ...vecinos(t, primera)]);
  let libres = t.celdas.map((_, i) => i).filter((i) => !lejos.has(i));
  // En un tablero muy lleno no alcanza: entonces solo se esquiva la primera.
  if (libres.length < t.minas) libres = t.celdas.map((_, i) => i).filter((i) => i !== primera);
  for (let k = libres.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [libres[k], libres[j]] = [libres[j], libres[k]];
  }
  const minas = new Set(libres.slice(0, t.minas));
  const celdas = t.celdas.map((c, i) => ({ ...c, mina: minas.has(i) }));
  celdas.forEach((c, i) => {
    c.vecinas = vecinos(t, i).filter((v) => celdas[v].mina).length;
  });
  return celdas;
}

/** Abre una celda (y, si no tiene minas alrededor, todo lo que la rodea, en cadena). */
export function abrir(t: Tablero, i: number): Tablero {
  if (t.estado === "ganada" || t.estado === "perdida") return t;
  const actual = t.celdas[i];
  if (actual.abierta || actual.bandera) return t;
  const celdas = t.estado === "listo" ? sembrar(t, i) : t.celdas.map((c) => ({ ...c }));
  return revelar({ ...t, celdas, estado: "jugando" }, [i]);
}

/**
 * Sobre un número que ya tiene sus banderas puestas, abre el resto de alrededor de una vez.
 * Si alguna bandera estaba mal, explota: como en el original.
 */
export function acorde(t: Tablero, i: number): Tablero {
  if (t.estado !== "jugando") return t;
  const c = t.celdas[i];
  if (!c.abierta || !c.vecinas) return t;
  const alrededor = vecinos(t, i);
  const banderas = alrededor.filter((v) => t.celdas[v].bandera).length;
  if (banderas !== c.vecinas) return t;
  const cerradas = alrededor.filter((v) => !t.celdas[v].abierta && !t.celdas[v].bandera);
  if (!cerradas.length) return t;
  return revelar({ ...t, celdas: t.celdas.map((x) => ({ ...x })) }, cerradas);
}

/** Abre las celdas pedidas sobre un tablero con celdas ya copiadas. */
function revelar(t: Tablero, desde: number[]): Tablero {
  const { celdas } = t;
  let abiertas = t.abiertas;
  const pila = [...desde];
  while (pila.length) {
    const i = pila.pop()!;
    const c = celdas[i];
    if (c.abierta || c.bandera) continue;
    if (c.mina) return perder({ ...t, celdas, abiertas }, i);
    c.abierta = true;
    abiertas++;
    if (!c.vecinas) for (const v of vecinos(t, i)) if (!celdas[v].abierta && !celdas[v].bandera) pila.push(v);
  }
  if (abiertas === t.cols * t.rows - t.minas) {
    // Ganada: las minas que faltaban quedan con bandera.
    for (const c of celdas) if (c.mina) c.bandera = true;
    return { ...t, celdas, abiertas, estado: "ganada", banderas: t.minas };
  }
  return { ...t, celdas, abiertas };
}

function perder(t: Tablero, i: number): Tablero {
  return { ...t, estado: "perdida", exploto: i };
}

export function alternarBandera(t: Tablero, i: number): Tablero {
  if (t.estado === "ganada" || t.estado === "perdida") return t;
  const c = t.celdas[i];
  if (c.abierta) return t;
  const celdas = t.celdas.slice();
  celdas[i] = { ...c, bandera: !c.bandera };
  return { ...t, celdas, banderas: t.banderas + (c.bandera ? -1 : 1) };
}
