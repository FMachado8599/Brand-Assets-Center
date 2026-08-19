/**
 * Lector de archivos de fuente. Lógica pura, sin React: abre el binario y
 * lee sus tablas OpenType (`name`, `fvar`, `OS/2`, `head`).
 *
 * .ttf, .otf, .ttc y .woff se leen directamente. .woff2 usa Brotli con
 * transformaciones, así que ahí se deduce del nombre del archivo.
 */

export type FontInstance = { styleName: string; weight: number; italic: boolean };
export type FontMeta = {
  family: string;
  instances: FontInstance[];
  isVariable: boolean;
  /** true si los datos salieron del archivo; false si se dedujeron del nombre */
  fromFile: boolean;
};

export const MAX_INSTANCES = 100;

/** "Montserrat" + "Light" → "Montserrat Light": el nombre que ve Illustrator. */
export const fullFontName = (family: string, styleName: string) =>
  `${family.trim()} ${styleName.trim()}`.replace(/\s+/g, " ").trim();

export const WEIGHT_LABEL: Record<number, string> = {
  100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium",
  600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black",
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

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data.length);
  copy.set(data);
  const stream = new Blob([copy.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readTables(buffer: ArrayBuffer): Promise<Map<string, DataView> | null> {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) return null;

  const tag = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const wanted = new Set(["name", "fvar", "OS/2", "head"]);
  const tables = new Map<string, DataView>();

  if (tag === "wOF2") return null;

  if (tag === "wOFF") {
    const numTables = view.getUint16(12);
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

  const base = tag === "ttcf" ? view.getUint32(12) : 0;
  const version = view.getUint32(base);
  if (version !== 0x00010000 && version !== 0x4f54544f && version !== 0x74727565) return null;

  const numTables = view.getUint16(base + 4);
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
    const start = storage + name.getUint16(r + 10);
    if (start + length > name.byteLength) continue;

    let text = "";
    if (platformId === 3 || platformId === 0) {
      for (let j = 0; j + 1 < length; j += 2) text += String.fromCharCode(name.getUint16(start + j));
    } else {
      for (let j = 0; j < length; j++) text += String.fromCharCode(name.getUint8(start + j));
    }
    text = text.replace(/\u0000/g, "").trim();
    if (text && !out.has(nameId)) out.set(nameId, text);
  }
  return out;
}

function readVariableInstances(fvar: DataView, names: Map<number, string>): FontInstance[] {
  if (fvar.byteLength < 16) return [];
  const axesOffset = fvar.getUint16(4);
  const axisCount = fvar.getUint16(8);
  const axisSize = fvar.getUint16(10);
  const instanceCount = Math.min(fvar.getUint16(12), MAX_INSTANCES);
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

  if (!instances.length && axes.includes("wght")) {
    for (const w of [100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      if (w < wghtMin - 1 || w > wghtMax + 1) continue;
      instances.push({ styleName: WEIGHT_LABEL[w], weight: w, italic: false });
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

function titleCase(s: string) {
  return s !== s.toUpperCase() ? s : s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function guessFromFilename(filename: string): FontMeta {
  const noExt = filename.replace(/\.(woff2|woff|ttf|otf|ttc)$/i, "");
  const noCopy = noExt.replace(/\s*\(\d+\)\s*$/, "").replace(/_+\d+_*$/, "").replace(/-copy\d*$/i, "");
  const isVariable = /variable|\bvf\b|wght|\[.*\]/i.test(noCopy);

  const spaced = noCopy.replace(/[-_]+/g, " ").replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim();
  const italic = /italic|oblique/i.test(spaced);
  const cleaned = spaced
    .replace(/variable\s*font|variablefont|\bwght\b|\bital\b|\bslnt\b|\bopsz\b|\[.*?\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  let weight = 400;
  let styleName = "Regular";
  let matched = "";
  for (const [re, w, label] of WEIGHT_TOKENS) {
    const m = cleaned.match(re);
    if (m) { weight = w; styleName = label; matched = m[0]; break; }
  }

  let family = matched ? cleaned.replace(matched, " ") : cleaned;
  family = family.replace(/italic|oblique/gi, " ").replace(/\s+/g, " ").trim();
  family = titleCase(family) || titleCase(spaced) || noCopy;

  if (italic) styleName = styleName === "Regular" ? "Italic" : `${styleName} Italic`;

  if (isVariable) {
    return {
      family,
      isVariable: true,
      fromFile: false,
      instances: [100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({
        styleName: italic ? `${WEIGHT_LABEL[w]} Italic` : WEIGHT_LABEL[w],
        weight: w,
        italic,
      })),
    };
  }
  return { family, isVariable: false, fromFile: false, instances: [{ styleName, weight, italic }] };
}

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
        return { family: names.get(16)?.trim() || family, instances, isVariable: true, fromFile: true };
      }
    }

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
