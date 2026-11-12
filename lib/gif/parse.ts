import type { Frame, GifGroup, GifSettings, InvalidFile, Size } from "./types";

/**
 * Cómo se arman los GIF a partir de los nombres: los archivos que se llaman igual y terminan en
 * un número son frames del mismo GIF, y el número es el orden.
 *
 *   banner_1.jpg  banner_2.jpg      un GIF «banner» de 2 frames
 *   Frame 1.png   Frame 2.png       también (espacio, guion, punto o (1) valen como separador)
 *   300x250_1.jpg 300x250_2.jpg     con la medida en el nombre, el GIF se llama «300x250»
 *   verano_300x250_2-1.5s.jpg       y la duración opcional va al final: -1.5s o -800ms
 *
 * Si no hay número al final se usa el último del nombre (summer_1_es.jpg → «summer_es»).
 * Los que no tienen la medida en el nombre se separan además por su medida real: un GIF tiene una
 * sola. Lo dudoso (sin número, o el único con ese nombre) queda suelto, para agruparlo a mano.
 */

const SEPARATOR = /[\s_\-.#]+/g;
const EDGES = /^[\s_\-.#()]+|[\s_\-.#()]+$/g;

export type ParsedName = {
  /** El nombre sin el número ni la medida, como se escribió: «verano», «Frame». Puede quedar vacío. */
  base: string;
  /** La medida si el nombre la dice (300x250). */
  size: Size | null;
  /** El número del orden; null si el nombre no tiene ninguno. */
  order: number | null;
  durationMs: number | null;
};

export function parseName(filename: string): ParsedName {
  let stem = filename.replace(/\.[^.]+$/, "").trim();

  // La duración va pegada después del número del orden: banner_2-1.5s, 728x90-1-800ms.
  let durationMs: number | null = null;
  const duration = stem.match(/^(.*[\d)])[\s_-]+(\d+(?:[.,]\d+)?)\s?(ms|s)$/i);
  if (duration) {
    const value = Number(duration[2].replace(",", "."));
    durationMs = Math.round(duration[3].toLowerCase() === "ms" ? value : value * 1000);
    stem = duration[1];
  }

  // La medida (300x250) se saca antes de buscar el número, para que su 250 no se tome como orden.
  let size: Size | null = null;
  const measure = stem.match(/(^|\D)(\d{2,4})\s?[x×]\s?(\d{2,4})(?=\D|$)/i);
  if (measure) {
    size = { width: Number(measure[2]), height: Number(measure[3]) };
    const start = measure.index + measure[1].length;
    stem = `${stem.slice(0, start)} ${stem.slice(measure.index + measure[0].length)}`;
  }

  let order: number | null = null;
  let base = stem;
  // El número del final: banner_12, Frame 3, foto (2).
  const trailing = stem.match(/^(.*?)[\s_\-.#]*\(?(\d+)\)?[\s_\-.#]*$/);
  if (trailing) {
    order = Number(trailing[2]);
    base = trailing[1];
  } else {
    // Si no termina en número, el último que tenga: summer_1_es → «summer_es».
    const numbers = [...stem.matchAll(/\d+/g)];
    const last = numbers[numbers.length - 1];
    if (last) {
      order = Number(last[0]);
      base = `${stem.slice(0, last.index)}_${stem.slice(last.index + last[0].length)}`;
    }
  }

  return { base: cleanName(base), size, order, durationMs };
}

/** Junta los separadores repetidos y saca los de las puntas: «verano__» → «verano». */
function cleanName(name: string) {
  return name.replace(SEPARATOR, (run) => (run.includes(" ") ? " " : run[0])).replace(EDGES, "");
}

/** La clave para comparar nombres: sin mayúsculas y con cualquier separador igual. */
const keyOf = (name: string) => name.toLowerCase().replace(SEPARATOR, "_");

const sizeLabel = (s: Size) => `${s.width}x${s.height}`;

/** Lo que el sistema no deja en un nombre de archivo. */
export function cleanGifName(name: string) {
  return name
    .replace(/\.gif$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim();
}

const IMAGE_TYPE = /^image\/(png|jpe?g|webp|gif)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

export async function readFiles(files: File[]): Promise<{ frames: Frame[]; invalid: InvalidFile[] }> {
  const frames: Frame[] = [];
  const invalid: InvalidFile[] = [];

  await Promise.all(
    files.map(async (file) => {
      const id = crypto.randomUUID();
      if (!IMAGE_TYPE.test(file.type) && !IMAGE_EXT.test(file.name)) {
        invalid.push({ id, filename: file.name, reason: "No es una imagen JPG, PNG, WebP o GIF" });
        return;
      }
      const url = URL.createObjectURL(file);
      const natural = await imageSize(file).catch(() => null);
      if (!natural) {
        invalid.push({ id, filename: file.name, url, reason: "No se pudo abrir la imagen" });
        return;
      }

      const parsed = parseName(file.name);
      const size = parsed.size ?? natural;
      // Con la medida en el nombre se llama como siempre (verano_300x250); si no, como el archivo sin el número.
      const name = parsed.size
        ? [parsed.base, sizeLabel(size)].filter(Boolean).join("_")
        : parsed.base || sizeLabel(size);
      // Sin número no hay con quién agruparla: queda suelta, con una clave solo suya.
      const groupKey =
        parsed.order === null ? `suelta:${id}` : `${keyOf(parsed.base)}|${parsed.size ? "" : "@"}${sizeLabel(size)}`;

      frames.push({
        id,
        file,
        filename: file.name,
        url,
        groupKey,
        groupName: name,
        ownName: name,
        namedSize: parsed.size ?? undefined,
        natural,
        order: parsed.order ?? 1,
        durationMs: parsed.durationMs,
        durationSource: parsed.durationMs === null ? "default" : "filename",
      });
    })
  );

  return { frames, invalid };
}

async function imageSize(file: File): Promise<Size> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

export const byOrder = (a: Frame, b: Frame) =>
  a.order - b.order || a.filename.localeCompare(b.filename, "es", { numeric: true });

/** La medida del GIF: la que dice el nombre o, si no, la que más se repite entre sus frames. */
function groupSize(frames: Frame[]): Size {
  const named = frames.find((f) => f.namedSize)?.namedSize;
  if (named) return named;
  const count = new Map<string, { size: Size; n: number }>();
  for (const f of frames) {
    const key = sizeLabel(f.natural);
    const entry = count.get(key) ?? { size: f.natural, n: 0 };
    entry.n++;
    count.set(key, entry);
  }
  // Map guarda el orden de inserción: ante un empate gana la del primer frame.
  return [...count.values()].reduce((best, e) => (e.n > best.n ? e : best)).size;
}

function orderWarnings(frames: Frame[]) {
  const warnings: string[] = [];
  const seen = new Set<number>();
  for (const f of frames) {
    if (seen.has(f.order)) warnings.push(`El frame ${f.order} está repetido`);
    seen.add(f.order);
  }
  const orders = [...seen].sort((a, b) => a - b);
  // Si arranca cerca del 1 se avisa desde el 1; si arranca en 34 (IMG_0034) no.
  const from = orders[0] <= 3 ? 1 : orders[0];
  const missing: number[] = [];
  for (let i = from; i <= orders[orders.length - 1]; i++) if (!seen.has(i)) missing.push(i);
  if (missing.length === 1) warnings.push(`Falta el frame ${missing[0]}`);
  else if (missing.length > 1 && missing.length <= 4) {
    warnings.push(`Faltan los frames ${missing.slice(0, -1).join(", ")} y ${missing[missing.length - 1]}`);
  } else if (missing.length > 4) {
    warnings.push(`Faltan ${missing.length} números en el orden, entre el ${from} y el ${orders[orders.length - 1]}`);
  }
  return warnings;
}

/** Todos los grupos, también los de un solo frame (las imágenes sueltas). */
export function buildGroups(frames: Frame[]): GifGroup[] {
  const byKey = new Map<string, Frame[]>();
  for (const f of frames) byKey.set(f.groupKey, [...(byKey.get(f.groupKey) ?? []), f]);

  const groups = [...byKey.entries()].map(([key, list]) => {
    const sorted = [...list].sort(byOrder);
    const { width, height } = groupSize(sorted);
    const warnings = sorted.length > 1 ? orderWarnings(sorted) : [];

    for (const f of sorted) {
      const { width: nw, height: nh } = f.natural;
      if (nw === width && nh === height) continue;
      const sameRatio = Math.abs(nw / nh - width / height) < 0.01;
      if (!sameRatio) warnings.push(`${f.filename} mide ${nw}×${nh}: va a quedar con bordes blancos`);
    }

    return { key, name: sorted[0].groupName, width, height, frames: sorted, warnings };
  });

  // Dos GIF no pueden llamarse igual (pisarían al otro en el ZIP): primero se les suma la medida, después un número.
  const gifs = groups.filter((g) => g.frames.length > 1);
  const repeated = (name: string) => gifs.filter((g) => g.name.toLowerCase() === name.toLowerCase()).length > 1;
  for (const g of gifs.filter((g) => repeated(g.name))) {
    const label = `${g.width}x${g.height}`;
    if (!g.name.toLowerCase().endsWith(label)) g.name = `${g.name}_${label}`;
  }
  const used = new Set<string>();
  for (const g of [...gifs].sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }))) {
    let name = g.name;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${g.name}-${n}`;
    used.add(name.toLowerCase());
    g.name = name;
  }

  return groups.sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
}

export function frameDuration(frame: Frame, settings: GifSettings) {
  const fallback = settings.unit === "ms" ? settings.defaultDuration : settings.defaultDuration * 1000;
  // Menos de 20 ms los navegadores lo muestran a 100 ms: se corta ahí.
  return Math.max(20, Math.round(frame.durationMs ?? fallback));
}

export function totalDuration(group: GifGroup, settings: GifSettings) {
  return group.frames.reduce((acc, f) => acc + frameDuration(f, settings), 0);
}

export function formatMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toLocaleString("es", { maximumFractionDigits: 2 })} s` : `${ms} ms`;
}
