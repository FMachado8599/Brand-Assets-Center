/**
 * Catálogo de formatos y opciones avanzadas. Son endpoints públicos de
 * FreeConvert (sin key, con CORS abierto), así que el navegador los consulta
 * directo. Cada respuesta se cachea por sesión: los formatos no cambian.
 */

const BASE = "https://api.freeconvert.com/v1/query";

export type Operation = "convert" | "compress";

export type FormatTarget = { name: string; slug: string; ext: string; type: string };

export type Targets = {
  /** Familia del archivo de entrada: image, video, audio, document… */
  type: string;
  defaultTarget?: string;
  secondaryDefaultTarget?: string;
  groups: Record<string, FormatTarget[]>;
};

type Condition = { name: string; meta: { value: string | number }[] };

export type OptionSchema = {
  name: string;
  label: string;
  hint?: string;
  data_type: "string" | "number" | "integer" | "boolean";
  type?: "enum";
  enum_values?: { value: string | number; label: string }[];
  default_value?: string;
  properties?: { min?: number; max?: number };
  units?: string;
  conditions?: Condition[];
};

export type OptionValues = Record<string, string | number | boolean>;

const cache = new Map<string, Promise<unknown>>();

function cached<T>(url: string, parse: (json: any) => T): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`FreeConvert respondió ${r.status}`);
        return r.json();
      })
      .then(parse);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/** Formatos a los que se puede llevar `inputFormat`. `null` si FreeConvert no lo soporta. */
export function getTargets(operation: Operation, inputFormat: string): Promise<Targets | null> {
  const url = `${BASE}/view/options?operation=${operation}&input_format=${encodeURIComponent(inputFormat)}`;
  return cached(url, (json) => {
    if (!json?.type) return null;
    const groups: Record<string, FormatTarget[]> = {};
    for (const [type, list] of Object.entries<FormatTarget[]>(json.targets ?? {})) {
      // FreeConvert lista alias ("WORD" → docx, "TEXT" → txt): nos quedamos con el formato real.
      const real = new Set(list.filter((t) => t.slug === t.ext).map((t) => t.ext));
      const clean = list.filter((t) => t.slug === t.ext || !real.has(t.ext));
      if (clean.length) groups[type] = clean;
    }
    if (!Object.keys(groups).length) return null;
    // `type` a veces es el subtipo ("apng" para png): la familia real es el grupo que contiene la entrada.
    const family = Object.keys(groups).find((g) => groups[g].some((t) => t.slug === inputFormat));
    return { type: family ?? json.type, defaultTarget: json.defaultTarget, secondaryDefaultTarget: json.secondaryDefaultTarget, groups };
  });
}

export function getOptionSchema(operation: Operation, input: string, output: string): Promise<OptionSchema[]> {
  const url = `${BASE}/options/${operation}?input_format=${encodeURIComponent(input)}&output_format=${encodeURIComponent(output)}`;
  return cached(url, (json) => (Array.isArray(json?.options) ? json.options : []));
}

/** Destinos más pedidos por familia, para que el formato inicial sea el razonable y no el primero alfabético. */
const PREFERRED: Record<string, string[]> = {
  image: ["jpg", "png", "webp"],
  video: ["mp4", "webm", "mov"],
  audio: ["mp3", "wav", "m4a"],
  document: ["pdf", "docx"],
  ebook: ["pdf", "epub"],
  archive: ["zip"],
};

/** Formato de salida inicial: comprimir mantiene el formato; convertir usa el sugerido por FreeConvert. */
export function pickDefaultTarget(targets: Targets, operation: Operation, input: string) {
  const all = Object.values(targets.groups).flat();
  const has = (ext?: string) => !!ext && all.some((t) => t.slug === ext);
  if (operation === "compress" && has(input)) return input;
  const candidates = [...(PREFERRED[targets.type] ?? []), targets.defaultTarget, targets.secondaryDefaultTarget];
  return (
    candidates.find((c) => c !== input && has(c)) ?? all.find((t) => t.slug !== input)?.slug ?? all[0]?.slug
  );
}

export function effectiveValue(o: OptionSchema, values: OptionValues) {
  return values[o.name] ?? o.default_value;
}

/** Una opción se muestra solo si las opciones de las que depende tienen alguno de los valores esperados. */
export function isVisible(o: OptionSchema, schema: OptionSchema[], values: OptionValues): boolean {
  return (o.conditions ?? []).every((c) => {
    const parent = schema.find((s) => s.name === c.name);
    const v = parent ? effectiveValue(parent, values) : values[c.name];
    return v !== undefined && c.meta.some((m) => String(m.value) === String(v));
  });
}

/** Arma el objeto `options` para FreeConvert: solo lo visible y distinto del default, con su tipo real. */
export function buildOptions(schema: OptionSchema[], values: OptionValues) {
  const out: OptionValues = {};
  for (const o of schema) {
    const v = values[o.name];
    if (v === undefined || v === "" || !isVisible(o, schema, values)) continue;
    if (o.default_value !== undefined && String(v) === String(o.default_value)) continue;
    if (o.data_type === "boolean") out[o.name] = v === true || v === "true";
    else if (o.data_type === "number" || o.data_type === "integer") {
      const n = Number(v);
      if (Number.isFinite(n)) out[o.name] = n;
    } else out[o.name] = String(v);
  }
  return out;
}

export function extensionOf(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function outputName(name: string, ext: string) {
  const i = name.lastIndexOf(".");
  return `${i > 0 ? name.slice(0, i) : name}.${ext}`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[u]}`;
}

export const GROUP_LABELS: Record<string, string> = {
  image: "Imagen",
  video: "Video",
  audio: "Audio",
  document: "Documento",
  ebook: "eBook",
  archive: "Archivo",
  vector: "Vector",
  font: "Fuente",
  presentation: "Presentación",
  spreadsheet: "Planilla",
  device: "Dispositivo",
};
