import { DICCIONARIO } from "./diccionario";
import { fold } from "./text";

/**
 * Texto predictivo con el vocabulario de cada cliente: aprende de lo que ya se escribió para él
 * (copys de sus planis y redacciones) y sugiere cómo seguir. Sin IA ni costo, y al instante: cuenta
 * palabras y qué viene después de cada una, y arranca con un diccionario básico para completar
 * desde el primer día (lo del cliente siempre le gana).
 *
 *  - A mitad de palabra ("Liber") completa con la palabra más usada que empiece así
 *    ("Libertadores"), prefiriendo la que suele venir después de la anterior.
 *  - Si después de esa palabra casi siempre viene lo mismo, sigue la frase entera ("Pura" →
 *    "Pura malta, puras emociones").
 *  - Después de un espacio, solo sugiere si la continuación es casi segura (se repitió y es la
 *    habitual): así no molesta mientras se escribe algo nuevo.
 */

type Conteo = Map<string, number>;

export type ModeloTexto = {
  /** Palabra (sin mayúsculas ni tildes) → sus formas tal cual se escribieron, con cuántas veces. */
  palabras: Map<string, Conteo>;
  /** Lo que viene después de una palabra (o signo). */
  siguientes: Map<string, Conteo>;
  /** Lo que viene después de dos seguidas (más preciso, si hay suficientes). */
  siguientes2: Map<string, Conteo>;
};

const PALABRA = /^[\p{L}\p{N}][\p{L}\p{N}'’_-]*$/u;
const TOKEN = /[#@]?[\p{L}\p{N}][\p{L}\p{N}'’_-]*|[.,!?¡¿;:]/gu;
/** Los emojis y saltos de línea cortan las frases: lo de un lado no sigue del otro. */
const CORTE = /[\n\r]|\p{Extended_Pictographic}/u;

const sumar = (map: Map<string, Conteo>, key: string, valor: string, n = 1) => {
  let c = map.get(key);
  if (!c) map.set(key, (c = new Map()));
  c.set(valor, (c.get(valor) ?? 0) + n);
};

const clave = (t: string) => fold(t);

/** Arma el modelo con todos los textos del cliente. */
export function entrenar(textos: string[]): ModeloTexto {
  const modelo: ModeloTexto = { palabras: new Map(), siguientes: new Map(), siguientes2: new Map() };
  for (const [palabra, peso] of DICCIONARIO) sumar(modelo.palabras, clave(palabra), palabra, peso);
  for (const texto of textos) {
    for (const tramo of texto.split(CORTE)) {
      const tokens = (tramo.match(TOKEN) ?? ([] as string[])).filter((t) => !t.startsWith("#") && !t.startsWith("@"));
      tokens.forEach((t, i) => {
        if (PALABRA.test(t) && t.length >= 3) sumar(modelo.palabras, clave(t), t);
        if (i > 0) sumar(modelo.siguientes, clave(tokens[i - 1]), t);
        if (i > 1) sumar(modelo.siguientes2, `${clave(tokens[i - 2])} ${clave(tokens[i - 1])}`, t);
      });
    }
  }
  return modelo;
}

const masUsada = (c: Conteo | undefined) => {
  if (!c) return null;
  let best: [string, number] | null = null;
  let total = 0;
  for (const [k, n] of c) {
    total += n;
    if (!best || n > best[1]) best = [k, n];
  }
  return best ? { valor: best[0], n: best[1], total } : null;
};

/**
 * Lo que sigue a esas palabras, si es bastante seguro: se repitió y es lo habitual. Con dos palabras de
 * contexto alcanza la mitad de las veces; con una sola, tres de cada cinco (o dos de cada cinco si ya
 * se vio muchas veces).
 */
function siguienteSegura(modelo: ModeloTexto, prev2: string | undefined, prev1: string) {
  const tri = prev2 ? masUsada(modelo.siguientes2.get(`${clave(prev2)} ${clave(prev1)}`)) : null;
  if (tri && tri.n >= 2 && tri.n / tri.total >= 0.5) return tri.valor;
  const bi = masUsada(modelo.siguientes.get(clave(prev1)));
  if (bi && ((bi.n >= 2 && bi.n / bi.total >= 0.6) || (bi.n >= 4 && bi.n / bi.total >= 0.4))) return bi.valor;
  return null;
}

/** Cómo se pega cada token al anterior: los signos van pegados; después de ¿ y ¡, la palabra también. */
function unir(prev: string | undefined, token: string) {
  if (/^[.,!?;:]$/.test(token)) return token;
  if (prev && /^[¿¡]$/.test(prev)) return token;
  return ` ${token}`;
}

const MAX_EXTRA = 5;
const MAX_LARGO = 70;

/** Sigue la frase desde los últimos tokens mientras la continuación sea segura. */
function seguir(modelo: ModeloTexto, tokens: string[]) {
  let out = "";
  const t = [...tokens];
  for (let i = 0; i < MAX_EXTRA; i++) {
    const next = siguienteSegura(modelo, t[t.length - 2], t[t.length - 1]);
    if (!next) break;
    out += unir(t[t.length - 1], next);
    t.push(next);
    if (out.length > MAX_LARGO || /^[.!?]$/.test(next)) break;
  }
  return out;
}

/**
 * La sugerencia para lo escrito antes del cursor (la línea actual), o null. Devuelve solo lo que
 * falta: "ra malta, puras emociones" para "Pu".
 */
export function sugerir(modelo: ModeloTexto, antes: string): string | null {
  const linea = antes.split(CORTE).pop() ?? "";
  if (!linea.trim()) return null;
  const tokens = (linea.match(TOKEN) ?? ([] as string[])).filter((t) => !t.startsWith("#") && !t.startsWith("@"));
  const aMitad = /[\p{L}\p{N}'’_-]$/u.test(linea) && !/[#@][\p{L}\p{N}_]*$/u.test(linea);

  if (aMitad) {
    const prefijo = tokens.pop();
    if (!prefijo) return null;
    // Palabra ya terminada, sin una más larga que la complete: sigue con lo que suele venir después,
    // sin tener que apretar espacio antes.
    const seguirPalabra = () => {
      const primera = siguienteSegura(modelo, tokens[tokens.length - 1], prefijo);
      if (!primera || !PALABRA.test(primera)) return null;
      return unir(prefijo, primera) + seguir(modelo, [...tokens, prefijo, primera]);
    };
    if (prefijo.length < 2) return seguirPalabra();
    const p = clave(prefijo);
    const prev1 = tokens[tokens.length - 1];
    const prev2 = tokens[tokens.length - 2];
    const despues1 = prev1 ? modelo.siguientes.get(clave(prev1)) : undefined;
    const despues2 = prev1 && prev2 ? modelo.siguientes2.get(`${clave(prev2)} ${clave(prev1)}`) : undefined;

    let mejor: { forma: string; puntos: number } | null = null;
    for (const [k, formas] of modelo.palabras) {
      if (k.length < p.length + 2 || !k.startsWith(p)) continue;
      const forma = masUsada(formas)!.valor;
      let contexto = 0;
      for (const [f, n] of despues1 ?? []) if (clave(f) === k) contexto += 3 * n;
      for (const [f, n] of despues2 ?? []) if (clave(f) === k) contexto += 5 * n;
      // Con dos letras solo si el contexto la respalda: si no, sugeriría cualquier cosa.
      if (p.length < 3 && !contexto) continue;
      const total = [...formas.values()].reduce((a, b) => a + b, 0);
      const puntos = total + contexto;
      if (!mejor || puntos > mejor.puntos || (puntos === mejor.puntos && forma.length < mejor.forma.length)) mejor = { forma, puntos };
    }
    if (!mejor) return seguirPalabra();
    let resto = mejor.forma.slice(prefijo.length);
    // Escrita en mayúsculas ("LIBER") → sigue en mayúsculas.
    if (prefijo.length >= 2 && prefijo === prefijo.toUpperCase() && /\p{L}/u.test(prefijo)) resto = resto.toUpperCase();
    return (resto + seguir(modelo, [...tokens, mejor.forma])).slice(0, MAX_LARGO + 20) || null;
  }

  // Después de un espacio: solo si es casi seguro cómo sigue.
  if (!/\s$/.test(linea) || !tokens.length) return null;
  const primera = siguienteSegura(modelo, tokens[tokens.length - 2], tokens[tokens.length - 1]);
  // Después de un espacio lo que sigue tiene que ser una palabra (no ", algo").
  if (!primera || !PALABRA.test(primera)) return null;
  return primera + seguir(modelo, [...tokens, primera]);
}
