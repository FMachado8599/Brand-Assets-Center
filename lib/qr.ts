/**
 * Código QR (ISO/IEC 18004) para un texto corto, como el link de un Jam: modo byte, corrección M,
 * versiones 1 a 10 (hasta 213 bytes). Sin librerías: es poco código y así no se suma una
 * dependencia solo para esto. Devuelve la matriz (true = módulo oscuro), sin el margen.
 */

const ECC_POR_BLOQUE = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOQUES = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const VERSION_MAX = 10;

/** Módulos disponibles para datos + corrección en cada versión. */
function modulosDeDatos(v: number) {
  let n = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const alineaciones = Math.floor(v / 7) + 2;
    n -= (25 * alineaciones - 10) * alineaciones - 55;
    if (v >= 7) n -= 36;
  }
  return n;
}

const capacidad = (v: number) => Math.floor(modulosDeDatos(v) / 8) - ECC_POR_BLOQUE[v] * BLOQUES[v];

// Reed-Solomon sobre GF(256), polinomio 0x11D.
function multiplicar(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisor(grado: number) {
  const r = new Array<number>(grado).fill(0);
  r[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = multiplicar(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = multiplicar(raiz, 0x02);
  }
  return r;
}

function resto(datos: number[], div: number[]) {
  const r = new Array<number>(div.length).fill(0);
  for (const b of datos) {
    const factor = b ^ (r.shift() as number);
    r.push(0);
    div.forEach((coef, i) => (r[i] ^= multiplicar(coef, factor)));
  }
  return r;
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

export function codigoQR(texto: string): boolean[][] | null {
  const bytes = Array.from(new TextEncoder().encode(texto));
  let v = 1;
  while (v <= VERSION_MAX && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > capacidad(v) * 8) v++;
  if (v > VERSION_MAX) return null;

  // 1. Bits: modo byte, largo, datos, terminador y relleno.
  const bits: number[] = [];
  const poner = (valor: number, largo: number) => {
    for (let i = largo - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  poner(0b0100, 4);
  poner(bytes.length, v < 10 ? 8 : 16);
  bytes.forEach((b) => poner(b, 8));
  const totalBits = capacidad(v) * 8;
  poner(0, Math.min(4, totalBits - bits.length));
  poner(0, (8 - (bits.length % 8)) % 8);
  for (let relleno = 0xec; bits.length < totalBits; relleno ^= 0xec ^ 0x11) poner(relleno, 8);
  const datos: number[] = [];
  for (let i = 0; i < bits.length; i += 8) datos.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  // 2. Bloques con su corrección, intercalados.
  const total = Math.floor(modulosDeDatos(v) / 8);
  const nBloques = BLOQUES[v];
  const ecc = ECC_POR_BLOQUE[v];
  const cortos = nBloques - (total % nBloques);
  const largoCorto = Math.floor(total / nBloques);
  const div = divisor(ecc);
  const bloques: number[][] = [];
  for (let i = 0, k = 0; i < nBloques; i++) {
    const dat = datos.slice(k, k + largoCorto - ecc + (i < cortos ? 0 : 1));
    k += dat.length;
    const correccion = resto(dat, div);
    if (i < cortos) dat.push(0);
    bloques.push(dat.concat(correccion));
  }
  const palabras: number[] = [];
  for (let i = 0; i < bloques[0].length; i++) {
    bloques.forEach((b, j) => {
      if (i !== largoCorto - ecc || j >= cortos) palabras.push(b[i]);
    });
  }

  // 3. Patrones fijos.
  const tam = v * 4 + 17;
  const m = Array.from({ length: tam }, () => new Array<boolean>(tam).fill(false));
  const fijo = Array.from({ length: tam }, () => new Array<boolean>(tam).fill(false));
  const set = (x: number, y: number, oscuro: boolean) => {
    m[y][x] = oscuro;
    fijo[y][x] = true;
  };
  for (let i = 0; i < tam; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [tam - 4, 3], [3, tam - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < tam && y >= 0 && y < tam) set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2;
    const paso = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    const pos = [6];
    for (let i = 0, p = tam - 7; i < n - 1; i++, p -= paso) pos.splice(1, 0, p);
    pos.forEach((x, i) =>
      pos.forEach((y, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      })
    );
  }
  const formato = (mascara: number) => {
    // Corrección M = 00.
    const dato = mascara;
    let r = dato;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((dato << 10) | r) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
    set(8, 7, bit(b, 6));
    set(8, 8, bit(b, 7));
    set(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) set(tam - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) set(8, tam - 15 + i, bit(b, i));
    set(8, tam - 8, true);
  };
  formato(0);
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) {
      const a = tam - 11 + (i % 3);
      const c = Math.floor(i / 3);
      set(a, c, bit(b, i));
      set(c, a, bit(b, i));
    }
  }

  // 4. Datos en zigzag, de abajo a la derecha.
  let i = 0;
  for (let derecha = tam - 1; derecha >= 1; derecha -= 2) {
    if (derecha === 6) derecha = 5;
    for (let vert = 0; vert < tam; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = derecha - j;
        const subiendo = ((derecha + 1) & 2) === 0;
        const y = subiendo ? tam - 1 - vert : vert;
        if (!fijo[y][x] && i < palabras.length * 8) {
          m[y][x] = bit(palabras[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }

  // 5. La máscara que deja el código más fácil de leer.
  const mascaras: ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0,
    (_, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const aplicar = (k: number) => {
    for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) if (!fijo[y][x] && mascaras[k](x, y)) m[y][x] = !m[y][x];
  };
  let mejor = 0;
  let menor = Infinity;
  for (let k = 0; k < 8; k++) {
    aplicar(k);
    formato(k);
    const p = penalidad(m);
    if (p < menor) {
      menor = p;
      mejor = k;
    }
    aplicar(k); // XOR: aplicarla de nuevo la deshace
  }
  aplicar(mejor);
  formato(mejor);
  return m;
}

/** Penalidad de la norma: rachas, bloques de 2×2, patrones parecidos a los de esquina y balance. */
function penalidad(m: boolean[][]) {
  const tam = m.length;
  let p = 0;
  const lineas: boolean[][] = [];
  for (let y = 0; y < tam; y++) lineas.push(m[y]);
  for (let x = 0; x < tam; x++) lineas.push(m.map((fila) => fila[x]));
  const patron = [true, false, true, true, true, false, true];
  for (const l of lineas) {
    let racha = 1;
    for (let i = 1; i <= tam; i++) {
      if (i < tam && l[i] === l[i - 1]) racha++;
      else {
        if (racha >= 5) p += racha - 2;
        racha = 1;
      }
    }
    for (let i = 0; i + 7 <= tam; i++) {
      if (!patron.every((b, k) => l[i + k] === b)) continue;
      const claro = (a: number, b: number) => {
        for (let k = a; k < b; k++) if (k >= 0 && k < tam && l[k]) return false;
        return true;
      };
      if (claro(i - 4, i) || claro(i + 7, i + 11)) p += 40;
    }
  }
  let oscuros = 0;
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      if (m[y][x]) oscuros++;
      if (x < tam - 1 && y < tam - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
  }
  const total = tam * tam;
  p += Math.ceil(Math.abs(oscuros * 20 - total * 10) / total - 1) * 10;
  return p;
}
