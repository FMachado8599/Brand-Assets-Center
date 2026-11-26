import { CACTUS_CHICO, CACTUS_GRANDE, DINO, LETRAS, NUBE, PAJARO, sprite, type Caja, type Sprite } from "./sprites";

/**
 * El juego del dino, sin React: física, obstáculos, choques y dibujo en un canvas.
 * Corre a pasos fijos de 1/60 s (step), así va igual de rápido en una pantalla de 60 Hz
 * que en una de 144 Hz y el ranking es parejo. Las medidas son las del original de Chrome,
 * en px del mundo (600 × 150) por paso.
 */

export const ANCHO = 600;
export const ALTO = 150;
export const PASO_MS = 1000 / 60;

/** Donde apoyan los pies (y los cactus). */
const SUELO = 137;
const DINO_X = 50;

const VEL_INICIAL = 6;
const VEL_MAXIMA = 13;
const ACELERACION = 0.001;
/**
 * Puntos por px recorrido. A velocidad máxima da 13 × 60 × 0,025 = 19,5 puntos por segundo:
 * la base no acepta más de 21 por segundo jugado (juego_puntaje_valido, migracion-juegos.sql).
 */
const PUNTOS_POR_PX = 0.025;

const GRAVEDAD = 0.6;
const SALTO = -10;
/** Al soltar la tecla el salto deja de subir con fuerza: saltitos cortos. */
const CAIDA = -5;
const ALTURA_MINIMA = 30;
/** La cabeza no pasa de acá con toda la fuerza del salto. */
const TECHO = 30;

/** Los primeros segundos no aparece nada: para arrancar tranquilo. */
const SIN_OBSTACULOS_MS = 3000;
const NOCHE_CADA = 700;
const NOCHE_MS = 12_000;
const FUNDIDO_MS = 600;
const DESTELLO_MS = 750;

/** Bajo (hay que saltarlo), a la altura de la cabeza (agacharse o saltar) y alto (pasa por arriba). */
const PAJARO_ALTURAS = [99, 80, 55];

type Tipo = "chico" | "grande" | "pajaro";

type Obstaculo = {
  tipo: Tipo;
  x: number;
  y: number;
  cantidad: number;
  ancho: number;
  brecha: number;
  /** Los pájaros van un poco más rápido o más lento que el suelo. */
  extra: number;
};

type Nube = { x: number; y: number };
type Mancha = { x: number; y: number; w: number };

export type EstadoDino = "listo" | "jugando" | "pausa" | "fin";

type Sprites = ReturnType<typeof armarSprites>;

function armarSprites() {
  return {
    quieto: sprite(DINO.quieto),
    correA: sprite(DINO.correA),
    correB: sprite(DINO.correB),
    chocado: sprite(DINO.chocado),
    agachadoA: sprite(DINO.agachadoA, 4),
    agachadoB: sprite(DINO.agachadoB, 4),
    chico: sprite(CACTUS_CHICO, 4),
    grande: sprite(CACTUS_GRANDE, 5),
    alasArriba: sprite(PAJARO.alasArriba, 4),
    alasAbajo: sprite(PAJARO.alasAbajo, 4),
    nube: sprite(NUBE, 99),
    letras: Object.fromEntries(Object.entries(LETRAS).map(([c, filas]) => [c, sprite(filas, 99)])) as Record<string, Sprite>,
  };
}

let cache: Sprites | null = null;
/** Los Path2D se arman recién en el navegador (en el servidor no existen). */
const sprites = () => (cache ??= armarSprites());

const azar = (min: number, max: number) => min + Math.random() * (max - min);
const elegir = <T,>(lista: T[]) => lista[Math.floor(Math.random() * lista.length)];

const choca = (a: Caja, ax: number, ay: number, b: Caja, bx: number, by: number) =>
  ax + a.x < bx + b.x + b.w && ax + a.x + a.w > bx + b.x && ay + a.y < by + b.y + b.h && ay + a.y + a.h > by + b.y;

/** Colores de día (el papel de las tarjetas, tinta) y de noche (al revés). */
const DIA = { fondo: [248, 246, 241], tinta: [29, 29, 33] };
const NOCHE = { fondo: [11, 11, 14], tinta: [235, 231, 221] };
const mezcla = (a: number[], b: number[], t: number, alfa = 1) =>
  `rgba(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")},${alfa})`;

export class Motor {
  estado: EstadoDino = "listo";
  private ms = 0;
  private distancia = 0;
  private vel = VEL_INICIAL;
  /** y de los pies: SUELO cuando está parado. */
  private pie = SUELO;
  private vy = 0;
  private saltando = false;
  private soltoSalto = false;
  private llegoArriba = false;
  private abajo = false;
  private agachado = false;
  private obstaculos: Obstaculo[] = [];
  private historial: Tipo[] = [];
  private nubes: Nube[] = [];
  private manchas: Mancha[] = [];
  private nocheHasta = 0;
  private destelloHasta = 0;
  private ultimoCentenar = 0;

  constructor() {
    this.reiniciar();
  }

  get puntaje() {
    return Math.floor(this.distancia * PUNTOS_POR_PX);
  }

  /** Vuelve al principio, parado y esperando el primer salto. */
  reiniciar() {
    Object.assign(this, {
      estado: "listo",
      ms: 0,
      distancia: 0,
      vel: VEL_INICIAL,
      pie: SUELO,
      vy: 0,
      saltando: false,
      soltoSalto: false,
      llegoArriba: false,
      agachado: false,
      obstaculos: [],
      historial: [],
      nocheHasta: 0,
      destelloHasta: 0,
      ultimoCentenar: 0,
    });
    this.nubes = [{ x: azar(80, 260), y: azar(25, 70) }, { x: azar(330, 560), y: azar(25, 70) }];
    // El suelo: manchitas y piedritas que pasan, en un patrón de dos pantallas que se repite.
    this.manchas = Array.from({ length: 70 }, () => ({ x: azar(0, ANCHO * 2), y: azar(SUELO + 1, SUELO + 10), w: elegir([2, 2, 4, 6]) }));
  }

  /** Tecla de salto apretada: arranca la partida si estaba lista. true si recién arrancó. */
  presionarSalto() {
    const arranca = this.estado === "listo";
    if (arranca) this.estado = "jugando";
    if (this.estado !== "jugando" || this.saltando || this.agachado) return arranca;
    this.saltando = true;
    this.soltoSalto = false;
    this.llegoArriba = false;
    this.vy = SALTO - this.vel / 10;
    return arranca;
  }

  soltarSalto() {
    this.soltoSalto = true;
  }

  /** Abajo: en el suelo se agacha; en el aire, cae más rápido. */
  apretarAbajo(apretado: boolean) {
    this.abajo = apretado;
    if (this.estado !== "jugando") return;
    this.agachado = apretado && !this.saltando;
  }

  pausar() {
    if (this.estado === "jugando") this.estado = "pausa";
  }

  seguir() {
    if (this.estado === "pausa") this.estado = "jugando";
  }

  /** Un paso de 1/60 s. Devuelve true en el paso en que choca. */
  step(): boolean {
    if (this.estado !== "jugando") return false;
    this.ms += PASO_MS;

    if (this.saltando) {
      this.pie += this.vy;
      this.vy += this.abajo ? GRAVEDAD * 3 : GRAVEDAD;
      const altura = SUELO - this.pie;
      if (!this.llegoArriba && this.pie - DINO.quieto.length * 2 < TECHO) this.llegoArriba = true;
      if ((this.llegoArriba || (this.soltoSalto && altura >= ALTURA_MINIMA)) && this.vy < CAIDA) this.vy = CAIDA;
      if (this.pie >= SUELO) {
        this.pie = SUELO;
        this.vy = 0;
        this.saltando = false;
        this.agachado = this.abajo;
      }
    }

    if (this.vel < VEL_MAXIMA) this.vel = Math.min(VEL_MAXIMA, this.vel + ACELERACION);
    this.distancia += this.vel;

    for (const n of this.nubes) n.x -= this.vel * 0.2;
    this.nubes = this.nubes.filter((n) => n.x > -60);
    const ultimaNube = this.nubes[this.nubes.length - 1];
    if (!ultimaNube || ultimaNube.x < ANCHO - azar(100, 400)) this.nubes.push({ x: ANCHO + azar(0, 40), y: azar(25, 70) });

    for (const o of this.obstaculos) o.x -= this.vel + o.extra;
    this.obstaculos = this.obstaculos.filter((o) => o.x + o.ancho > 0);
    const ultimo = this.obstaculos[this.obstaculos.length - 1];
    if (this.ms > SIN_OBSTACULOS_MS && (!ultimo || ultimo.x + ultimo.ancho + ultimo.brecha < ANCHO)) this.nuevoObstaculo();

    const centenar = Math.floor(this.puntaje / 100);
    if (centenar > this.ultimoCentenar) {
      this.ultimoCentenar = centenar;
      this.destelloHasta = this.ms + DESTELLO_MS;
      if ((centenar * 100) % NOCHE_CADA === 0) this.nocheHasta = this.ms + NOCHE_MS;
    }

    if (this.chocó()) {
      this.estado = "fin";
      return true;
    }
    return false;
  }

  private nuevoObstaculo() {
    const s = sprites();
    const tipos: Tipo[] = this.vel > 8.5 ? ["chico", "grande", "pajaro"] : ["chico", "grande"];
    let tipo = elegir(tipos);
    // Nunca tres iguales seguidos.
    if (this.historial.length >= 2 && this.historial.every((t) => t === tipo)) tipo = elegir(tipos.filter((t) => t !== tipo));
    this.historial = [tipo, ...this.historial].slice(0, 2);

    const sp = tipo === "chico" ? s.chico : tipo === "grande" ? s.grande : s.alasArriba;
    // Los grupos de cactus aparecen cuando ya se va rápido.
    const maximo = tipo === "pajaro" ? 1 : this.vel > (tipo === "chico" ? 4 : 7) ? 3 : 1;
    const cantidad = 1 + Math.floor(Math.random() * maximo);
    const ancho = sp.w * cantidad;
    const minima = Math.round(ancho * this.vel + (tipo === "pajaro" ? 150 : 120) * 0.6);
    this.obstaculos.push({
      tipo,
      x: ANCHO,
      y: tipo === "pajaro" ? elegir(PAJARO_ALTURAS) : SUELO - sp.h,
      cantidad,
      ancho,
      brecha: Math.round(azar(minima, minima * 1.5)),
      extra: tipo === "pajaro" ? elegir([-0.8, 0.8]) : 0,
    });
  }

  private spriteDino(): Sprite {
    const s = sprites();
    if (this.estado === "fin") return s.chocado;
    if (this.estado === "listo" || this.saltando) return s.quieto;
    const cuadro = Math.floor(this.ms / (1000 / 12)) % 2 === 0;
    if (this.agachado) return cuadro ? s.agachadoA : s.agachadoB;
    return cuadro ? s.correA : s.correB;
  }

  private spriteObstaculo(o: Obstaculo): Sprite {
    const s = sprites();
    if (o.tipo === "pajaro") return Math.floor(this.ms / (1000 / 6)) % 2 === 0 ? s.alasArriba : s.alasAbajo;
    return o.tipo === "chico" ? s.chico : s.grande;
  }

  private chocó() {
    const dino = this.spriteDino();
    const dy = this.pie - dino.h;
    for (const o of this.obstaculos) {
      if (o.x > DINO_X + dino.w || o.x + o.ancho < DINO_X) continue;
      const sp = this.spriteObstaculo(o);
      for (let i = 0; i < o.cantidad; i++) {
        const ox = o.x + i * sp.w;
        for (const a of dino.cajas) for (const b of sp.cajas) if (choca(a, DINO_X, dy, b, ox, o.y)) return true;
      }
    }
    return false;
  }

  /** 0 de día, 1 de noche; con un fundido al entrar y al salir. */
  private noche() {
    const resta = this.nocheHasta - this.ms;
    if (resta <= 0) return 0;
    const paso = this.ms - (this.nocheHasta - NOCHE_MS);
    return Math.max(0, Math.min(1, paso / FUNDIDO_MS, resta / FUNDIDO_MS));
  }

  /** Pinta el cuadro. `escala`: px del canvas por px del mundo. `record`: el HI de arriba a la derecha. */
  dibujar(ctx: CanvasRenderingContext2D, escala: number, record: number | null) {
    const s = sprites();
    const n = this.noche();
    const tinta = mezcla(DIA.tinta, NOCHE.tinta, n);
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.fillStyle = mezcla(DIA.fondo, NOCHE.fondo, n);
    ctx.fillRect(0, 0, ANCHO, ALTO);

    const pintar = (sp: Sprite, x: number, y: number) => {
      if (!sp.path) return;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.fill(sp.path);
      ctx.restore();
    };

    ctx.fillStyle = mezcla(DIA.tinta, NOCHE.tinta, n, 0.18);
    for (const nube of this.nubes) pintar(s.nube, nube.x, nube.y);

    // Suelo: la línea y lo que pasa por debajo.
    ctx.fillStyle = tinta;
    ctx.fillRect(0, SUELO - 5, ANCHO, 2);
    const corrido = this.distancia % (ANCHO * 2);
    ctx.fillStyle = mezcla(DIA.tinta, NOCHE.tinta, n, 0.55);
    for (const m of this.manchas) {
      const x = (((m.x - corrido) % (ANCHO * 2)) + ANCHO * 2) % (ANCHO * 2);
      if (x < ANCHO) ctx.fillRect(Math.round(x), Math.round(m.y), m.w, 2);
    }

    ctx.fillStyle = tinta;
    for (const o of this.obstaculos) {
      const sp = this.spriteObstaculo(o);
      for (let i = 0; i < o.cantidad; i++) pintar(sp, o.x + i * sp.w, o.y);
    }
    const dino = this.spriteDino();
    pintar(dino, DINO_X, this.pie - dino.h);

    // Puntaje: titila al pasar cada centenar, como el original.
    const destello = this.destelloHasta - this.ms;
    const titila = this.estado === "jugando" && destello > 0;
    const visible = !titila || Math.floor(destello / 125) % 2 === 1;
    const actual = titila ? this.ultimoCentenar * 100 : this.puntaje;
    const cinco = (v: number) => String(v).padStart(5, "0");
    const letra = (texto: string, xFinal: number) => {
      let x = xFinal - texto.length * 8 + 2;
      for (const c of texto) {
        const sp = s.letras[c];
        if (sp) pintar(sp, x, 12);
        x += 8;
      }
    };
    if (visible) letra(cinco(actual), ANCHO - 12);
    if (record !== null && record > 0) {
      ctx.fillStyle = mezcla(DIA.tinta, NOCHE.tinta, n, 0.5);
      letra(`HI ${cinco(record)}`, ANCHO - 12 - 6 * 8 - 8);
    }
  }
}
