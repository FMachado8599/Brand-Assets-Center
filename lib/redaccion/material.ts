import { fold } from "./text";

/**
 * El material de marca del cliente (sus presentaciones, manuales y notas) hecho consultable, sin IA:
 * se corta en pasajes y, mientras se escribe, se buscan los que hablan de lo mismo (por las palabras
 * que comparten, dándole más peso a las menos comunes). Esos pasajes viajan con el pedido a la IA
 * para que escriba con el vocabulario y lo que comunica la marca, y todo el texto además alimenta
 * al texto predictivo.
 */

export type FuenteMaterial = {
  id: string;
  nombre: string;
  /** Lo que hay que saber para usarlo, escrito por quien lo subió. */
  nota: string;
  /** Lo que se le leyó al archivo. */
  texto: string;
};

type Pasaje = { fuente: string; nombre: string; texto: string; palabras: Set<string>; indice: number };

export type IndiceMaterial = {
  pasajes: Pasaje[];
  /** En cuántos pasajes aparece cada palabra. */
  frecuencia: Map<string, number>;
};

/** Cuántos pasajes mandar a la IA y de qué largo (el servidor acepta hasta 4 de 600). */
export const MAX_PASAJES = 3;
export const LARGO_PASAJE = 520;
/** Del texto de los documentos solo se entrena el predictivo con esto: un manual enorme no lo vuelve lento. */
const MAX_ENTRENAR = 400_000;

const VACIAS = new Set(
  (
    "a al algo algun alguna algunas alguno algunos ante antes aqui asi aun aunque cada casi como con contra cual cuando de del desde donde " +
    "dos el ella ellas ellos en entre era eran es esa esas ese eso esos esta estaba estan estar este esto estos fue fueron ha han hasta hay " +
    "la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros nuestra nuestras nuestro nuestros o os otra otras otro otros para " +
    "pero poco por porque que quien quienes se sea segun ser si sin sobre su sus tambien tan tanto te tiene tienen todo todos tu tus un una " +
    "unas uno unos usted ustedes va vamos van vos y ya yo the and of to in for"
  ).split(" ")
);

/** Las palabras que cuentan de un texto: sin tildes ni mayúsculas, sin las vacías y con el plural suelto. */
function palabrasDe(texto: string): string[] {
  const out: string[] = [];
  for (const crudo of fold(texto).split(/[^\p{L}\p{N}]+/u)) {
    if (crudo.length < 3 || VACIAS.has(crudo) || /^\d+$/.test(crudo)) continue;
    out.push(crudo.length > 4 && crudo.endsWith("es") ? crudo.slice(0, -2) : crudo.length > 3 && crudo.endsWith("s") ? crudo.slice(0, -1) : crudo);
  }
  return out;
}

/** Corta un texto en pasajes de hasta `max` letras, juntando oraciones y líneas cortas. */
function trocear(texto: string, max = LARGO_PASAJE): string[] {
  const frases = texto
    .split(/\n+/)
    .flatMap((linea) => linea.match(/[^.!?]+[.!?]*/g) ?? [])
    .map((f) => f.trim())
    .filter(Boolean);
  const pasajes: string[] = [];
  let actual = "";
  const cerrar = () => {
    if (actual.length >= 25) pasajes.push(actual);
    actual = "";
  };
  for (const frase of frases) {
    // Una frase más larga que un pasaje (una lista, una diapositiva sin puntos) se parte igual.
    for (let i = 0; i < frase.length; i += max) {
      const parte = frase.slice(i, i + max).trim();
      if (actual && actual.length + parte.length + 1 > max) cerrar();
      actual += (actual ? " " : "") + parte;
    }
  }
  cerrar();
  return pasajes;
}

export function indexar(fuentes: FuenteMaterial[]): IndiceMaterial {
  const pasajes: Pasaje[] = [];
  for (const f of fuentes) {
    const piezas = [f.nota.trim() ? `Nota: ${f.nota.trim()}` : "", ...trocear(f.texto)].filter(Boolean);
    piezas.forEach((texto, indice) => {
      const palabras = new Set(palabrasDe(texto));
      if (palabras.size) pasajes.push({ fuente: f.id, nombre: f.nombre, texto, palabras, indice });
    });
  }
  const frecuencia = new Map<string, number>();
  for (const p of pasajes) for (const w of p.palabras) frecuencia.set(w, (frecuencia.get(w) ?? 0) + 1);
  return { pasajes, frecuencia };
}

const formatear = (p: Pasaje) => `${p.nombre}: ${p.texto}`.slice(0, 600);

/**
 * Los pasajes del material que más tienen que ver con el texto que se está escribiendo (lo último
 * pesa más). Si no coincide ninguno —típicamente al empezar— devuelve el comienzo de los primeros
 * documentos, que suele decir quién es la marca.
 */
export function buscar(indice: IndiceMaterial, antes: string, cuantos = MAX_PASAJES): string[] {
  const { pasajes, frecuencia } = indice;
  if (!pasajes.length) return [];

  const consulta = new Map<string, number>();
  const recientes = palabrasDe(antes.slice(-600));
  recientes.forEach((w, i) => consulta.set(w, Math.max(consulta.get(w) ?? 0, 0.5 + (0.5 * (i + 1)) / recientes.length)));

  const total = pasajes.length;
  const puntaje = (p: Pasaje) => {
    let s = 0;
    for (const [w, peso] of consulta) if (p.palabras.has(w)) s += peso * Math.log(1 + total / (frecuencia.get(w) ?? 1));
    return s;
  };

  const ranking = pasajes
    .map((p) => ({ p, s: puntaje(p) }))
    .filter((x) => x.s >= 1.5)
    .sort((a, b) => b.s - a.s);

  const elegidos: Pasaje[] = [];
  const porFuente = new Map<string, number>();
  for (const { p } of ranking) {
    if ((porFuente.get(p.fuente) ?? 0) >= 2) continue;
    elegidos.push(p);
    porFuente.set(p.fuente, (porFuente.get(p.fuente) ?? 0) + 1);
    if (elegidos.length >= cuantos) break;
  }

  if (!elegidos.length) {
    const vistas = new Set<string>();
    for (const p of pasajes) {
      if (vistas.has(p.fuente)) continue;
      vistas.add(p.fuente);
      elegidos.push(p);
      if (elegidos.length >= Math.min(2, cuantos)) break;
    }
  }
  return elegidos.map(formatear);
}

/** Los textos para entrenar al predictivo: lo leído de los documentos, hasta un tope. */
export function textosParaEntrenar(fuentes: FuenteMaterial[]): string[] {
  const out: string[] = [];
  let total = 0;
  for (const f of fuentes) {
    for (const t of [f.nota, f.texto]) {
      if (!t.trim() || total >= MAX_ENTRENAR) continue;
      out.push(t.slice(0, MAX_ENTRENAR - total));
      total += out[out.length - 1].length;
    }
  }
  return out;
}
