/**
 * Lee los metadatos reales del archivo de fuente en vez de adivinarlos por
 * el nombre. Abre las tablas `name`, `fvar`, `OS/2` y `head` del sfnt.
 *
 * Lo importante: si el archivo es una fuente variable (un solo .ttf con
 * todos los pesos adentro, como los que descarga Google Fonts), acá salen
 * sus instancias nombradas — Thin, ExtraLight, Light, Regular… — y cada
 * una se puede registrar como una tipografía independiente.
 *
 * Formatos: .ttf, .otf, .ttc y .woff se leen directamente. .woff2 usa
 * compresión Brotli con transformaciones, así que ahí volvemos a deducir
 * por el nombre del archivo.
 */

export type FontInstance = {
  styleName: string;
  weight: number;
  italic: boolean;
};

export type FontMeta = {
  family: string;
  instances: FontInstance[];
  isVariable: boolean;
  /** true si los datos salieron del archivo; false si se dedujeron del nombre */
  fromFile: boolean;
};

const WEIGHT_TOKENS: [RegExp, number, string][] = [
  [/extra\s*-?\s*light|ultra\s*-?\s*light/i, 200, "ExtraLight"],
  [/semi\s*-?\s*bold|demi\s*-?\s*bold/i, 600, "SemiBold"],
  [/extra\s*-?\s*bold|ultra\s*-?\s*bold/i, 800, "ExtraBold"],
  [/thin|hairline/i, 100, "Thin"],
  [/black|heavy|fat/i, 900, "Black"],
  [/light/i, 300, "Light"],
  [/medium/i, 500, "Medium"],
  [/bold/i, 700, "Bold"],
  [/regular|normal|book|roman/i, 400, "Regular"],
];

/* ------------------------------------------------------------ sfnt */

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const copy = new Uint8Array(data.length);
  copy.set(data);
  const stream = new Blob([copy.buffer as ArrayBuffer]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** Devuelve un DataView por cada tabla que nos interesa. */
async function readTables(buffer: ArrayBuffer): Promise<Map<string, DataView> | null> {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) return null;

  const tag = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const wanted = new Set(["name", "fvar", "OS/2", "head"]);

  if (tag === "wOF2") return null; // Brotli: no lo desarmamos acá

  if (tag === "wOFF") {
    const numTables = view.getUint16(12);
    const tables = new Map<string, DataView>();
    for (let i = 0; i < numTables; i++) {
      const o = 44 + i * 20;
      if (o + 20 > buffer.byteLength) break;
      const t = String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
      if (!wanted.has(t)) continue;
      const offset = view.getUint32(o + 4);
      const compLength = view.getUint32(o + 8);
      const origLength = view.getUint32(o + 12);
      const slice = new Uint8Array(buffer, offset, compLength);
      const bytes = compLength < origLength ? await inflate(slice) : slice;
      tables.set(t, new DataView(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength));
    }
    return tables;
  }

  // sfnt normal, o colección .ttc
  let base = 0;
  if (tag === "ttcf") base = view.getUint32(12);

  const version = view.getUint32(base);
  const isSfnt = version === 0x00010000 || version === 0x4f54544f || version === 0x74727565;
  if (!isSfnt) return null;

  const numTables = view.getUint16(base + 4);
  const tables = new Map<string, DataView>();
  for (let i = 0; i < numTables; i++) {
    const o = base + 12 + i * 16;
    if (o + 16 > buffer.byteLength) break;
    const t = String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    if (!wanted.has(t)) continue;
    const offset = view.getUint32(o + 8);
    const length = view.getUint32(o + 12);
    if (offset + length > buffer.byteLength) continue;
    tables.set(t, new DataView(buffer, offset, length));
  }
  return tables;
}

/* ------------------------------------------------------- tabla name */

function readNames(name: DataView): Map<number, string> {
  const out = new Map<number, string>();
  if (name.byteLength < 6) return out;

  const count = name.getUint16(2);
  const storage = name.getUint16(4);

  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    if (r + 12 > name.byteLength) break;
    const platformId = name.getUint16(r);
    const nameId = name.getUint16(r + 6);
    const length = name.getUint16(r + 8);
    const offset = name.getUint16(r + 10);
    const start = storage + offset;
    if (start + length > name.byteLength) continue;

    let text = "";
    if (platformId === 3 || platformId === 0) {
      for (let j = 0; j + 1 < length; j += 2) text += String.fromCharCode(name.getUint16(start + j));
    } else {
      for (let j = 0; j < length; j++) text += String.fromCharCode(name.getUint8(start + j));
    }
    text = text.replace(/\u0000/g, "").trim();
    // Preferimos la primera lectura (suele ser inglés) pero no pisamos con vacío
    if (text && !out.has(nameId)) out.set(nameId, text);
  }
  return out;
}

/* -------------------------------------------------------- tabla fvar */

function readVariableInstances(fvar: DataView, names: Map<number, string>): FontInstance[] {
  if (fvar.byteLength < 16) return [];

  const axesOffset = fvar.getUint16(4);
  const axisCount = fvar.getUint16(8);
  const axisSize = fvar.getUint16(10);
  const instanceCount = fvar.getUint16(12);
  const instanceSize = fvar.getUint16(14);

  const axes: string[] = [];
  let wghtMin = 400;
  let wghtMax = 400;
  for (let a = 0; a < axisCount; a++) {
    const o = axesOffset + a * axisSize;
    if (o + 20 > fvar.byteLength) break;
    const tag = String.fromCharCode(fvar.getUint8(o), fvar.getUint8(o + 1), fvar.getUint8(o + 2), fvar.getUint8(o + 3));
    axes.push(tag);
    if (tag === "wght") {
      wghtMin = fvar.getInt32(o + 4) / 65536;
      wghtMax = fvar.getInt32(o + 12) / 65536;
    }
  }

  const instances: FontInstance[] = [];
  const base = axesOffset + axisCount * axisSize;

  for (let i = 0; i < instanceCount; i++) {
    const o = base + i * instanceSize;
    if (o + 4 + axisCount * 4 > fvar.byteLength) break;
    const styleName = names.get(fvar.getUint16(o)) || "";

    let weight = 400;
    let italic = /italic|oblique/i.test(styleName);
    for (let a = 0; a < axisCount; a++) {
      const value = fvar.getInt32(o + 4 + a * 4) / 65536;
      if (axes[a] === "wght") weight = Math.round(value);
      if (axes[a] === "ital" && value >= 0.5) italic = true;
      if (axes[a] === "slnt" && value !== 0) italic = true;
    }
    if (styleName) instances.push({ styleName, weight, italic });
  }

  // Sin instancias nombradas: generamos los pesos redondos del rango
  if (!instances.length && axes.includes("wght")) {
    for (const w of [100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      if (w < wghtMin - 1 || w > wghtMax + 1) continue;
      instances.push({ styleName: WEIGHT_TOKENS.find(([, weight]) => weight === w)?.[2] || String(w), weight: w, italic: false });
    }
  }

  const seen = new Set<string>();
  return instances.filter((i) => {
    const key = `${i.weight}-${i.italic}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ----------------------------------------------------- nombre de archivo */

function titleCase(s: string) {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Plan B: deducir familia y peso desde el nombre del archivo. */
export function guessFromFilename(filename: string): FontMeta {
  const noExt = filename.replace(/\.(woff2|woff|ttf|otf|ttc)$/i, "");
  const noCopy = noExt
    .replace(/\s*\(\d+\)\s*$/, "")   // "Montserrat-Light (1)"
    .replace(/_+\d+_*$/, "")          // "MONTSERRAT_1_"
    .replace(/-copy\d*$/i, "");

  const isVariable = /variable|\bvf\b|wght|\[.*\]/i.test(noCopy);

  const spaced = noCopy
    .replace(/[-_]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  const italic = /italic|oblique/i.test(spaced);
  const cleaned = spaced.replace(/variable\s*font|variablefont|\bwght\b|\bital\b|\bslnt\b|\bopsz\b|\[.*?\]/gi, " ").replace(/\s+/g, " ").trim();

  let weight = 400;
  let styleName = "Regular";
  let matched = "";
  for (const [re, w, label] of WEIGHT_TOKENS) {
    const m = cleaned.match(re);
    if (m) {
      weight = w;
      styleName = label;
      matched = m[0];
      break;
    }
  }

  let family = cleaned;
  if (matched) family = family.replace(matched, " ");
  family = family.replace(/italic|oblique/gi, " ").replace(/\s+/g, " ").trim();
  family = titleCase(family) || titleCase(spaced) || noCopy;

  if (italic) styleName = styleName === "Regular" ? "Italic" : `${styleName} Italic`;

  if (isVariable) {
    return {
      family,
      isVariable: true,
      fromFile: false,
      instances: [100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({
        styleName: WEIGHT_TOKENS.find(([, weight]) => weight === w)?.[2] || String(w),
        weight: w,
        italic,
      })),
    };
  }

  return { family, isVariable: false, fromFile: false, instances: [{ styleName, weight, italic }] };
}

/* --------------------------------------------------------------- API */

export async function readFontFile(file: File): Promise<FontMeta> {
  try {
    const tables = await readTables(await file.arrayBuffer());
    const nameTable = tables?.get("name");
    if (!tables || !nameTable) return guessFromFilename(file.name);

    const names = readNames(nameTable);
    let family = (names.get(16) || names.get(1) || "").trim();
    let subfamily = (names.get(17) || names.get(2) || "Regular").trim();
    if (!family) return guessFromFilename(file.name);

    const fvar = tables.get("fvar");
    if (fvar) {
      const instances = readVariableInstances(fvar, names);
      if (instances.length) {
        // En una variable, nameID 1 suele traer pegada la instancia por
        // defecto ("Montserrat Thin"); nameID 16 da la familia limpia.
        return { family: names.get(16)?.trim() || family, instances, isVariable: true, fromFile: true };
      }
    }

    // Estática: el peso real está en OS/2
    const os2 = tables.get("OS/2");
    const head = tables.get("head");
    let weight = os2 && os2.byteLength >= 6 ? os2.getUint16(4) : 400;
    if (weight < 1 || weight > 1000) weight = 400;

    const macStyle = head && head.byteLength >= 46 ? head.getUint16(44) : 0;
    const italic = Boolean(macStyle & 0b10) || /italic|oblique/i.test(subfamily);

    // Nombres viejos: familia "Montserrat Light" + subfamilia "Regular"
    if (!names.get(16) && /^(regular|bold|italic|bold italic)$/i.test(subfamily)) {
      for (const [re, , label] of WEIGHT_TOKENS) {
        const m = family.match(new RegExp(`\\s+${re.source}$`, "i"));
        if (m) {
          family = family.slice(0, m.index).trim();
          subfamily = italic ? `${label} Italic` : label;
          break;
        }
      }
    }

    return { family, instances: [{ styleName: subfamily, weight, italic }], isVariable: false, fromFile: true };
  } catch {
    return guessFromFilename(file.name);
  }
}

export function formatFromFilename(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "woff2") return "woff2";
  if (ext === "woff") return "woff";
  if (ext === "otf") return "opentype";
  return "truetype";
}
