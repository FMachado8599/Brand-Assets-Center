import { fold } from "@/lib/redaccion/text";
import type { Brand, BrandLogo, LogoBg, LogoFile, LogoFormat, LogoGroup } from "@/lib/types";

/**
 * Los logos de un cliente: varias versiones (horizontal, isotipo, negativo…), cada una con sus
 * archivos (SVG, AI, PDF, PNG…), ordenadas en grupos. Acá está todo lo que no es pantalla: qué
 * formatos se aceptan, cómo se juntan los archivos que son del mismo logo y cómo se mueven.
 *
 * Los archivos se juntan por el nombre: los que se llaman igual son el mismo logo en otro formato.
 *
 *   horizontal.svg  horizontal.png  horizontal.ai     un logo «Horizontal» con SVG, PNG y AI
 *   Changan_Isotipo-negativo.pdf                      «Isotipo negativo» (sin el nombre del cliente)
 */

type FormatInfo = {
  label: string;
  /** Con qué tipo se sube al bucket (tiene que estar en los que acepta: migracion-logos.sql). */
  mime: string;
  /** Las extensiones que lo identifican; la primera es con la que se descarga. */
  exts: string[];
  /** Escalable sin perder calidad: para imprenta y para editar. */
  vector: boolean;
  /** El navegador lo puede mostrar. */
  preview: boolean;
};

export const LOGO_FORMATS: Record<LogoFormat, FormatInfo> = {
  svg: { label: "SVG", mime: "image/svg+xml", exts: ["svg"], vector: true, preview: true },
  ai: { label: "AI", mime: "application/postscript", exts: ["ai"], vector: true, preview: false },
  eps: { label: "EPS", mime: "application/postscript", exts: ["eps"], vector: true, preview: false },
  pdf: { label: "PDF", mime: "application/pdf", exts: ["pdf"], vector: true, preview: false },
  png: { label: "PNG", mime: "image/png", exts: ["png"], vector: false, preview: true },
  jpg: { label: "JPG", mime: "image/jpeg", exts: ["jpg", "jpeg"], vector: false, preview: true },
  webp: { label: "WEBP", mime: "image/webp", exts: ["webp"], vector: false, preview: true },
  gif: { label: "GIF", mime: "image/gif", exts: ["gif"], vector: false, preview: true },
};

/** El orden en que se muestran los formatos de un logo: primero los vectoriales. */
export const FORMAT_ORDER: LogoFormat[] = ["svg", "ai", "eps", "pdf", "png", "jpg", "webp", "gif"];

/** De qué archivo se saca la vista previa, si tiene varios. */
const PREVIEW_ORDER: LogoFormat[] = ["svg", "png", "webp", "jpg", "gif"];

export const LOGO_FILES_ACCEPT = FORMAT_ORDER.flatMap((f) => LOGO_FORMATS[f].exts.map((e) => `.${e}`)).join(",");

/** Lo que acepta el bucket por archivo (migracion-logos.sql). */
const MAX_BYTES = 50 * 1024 * 1024;

const isFormat = (value: unknown): value is LogoFormat => typeof value === "string" && value in LOGO_FORMATS;

const extOf = (filename: string) => (/\.([a-z0-9]+)$/i.exec(filename)?.[1] ?? "").toLowerCase();

/** El formato de un archivo, por su extensión (o por su tipo, si no tiene). null si no es de logo. */
export function formatOf(file: Pick<File, "name" | "type">): LogoFormat | null {
  const ext = extOf(file.name);
  const byExt = FORMAT_ORDER.find((f) => LOGO_FORMATS[f].exts.includes(ext));
  if (byExt) return byExt;
  if (ext) return null;
  return FORMAT_ORDER.find((f) => LOGO_FORMATS[f].mime === file.type && LOGO_FORMATS[f].preview) ?? null;
}

/** null si el archivo se puede sumar a los logos; si no, por qué. */
export function logoFileProblem(file: File): string | null {
  if (!formatOf(file)) return `${file.name}: no es SVG, AI, EPS, PDF, PNG, JPG, WEBP ni GIF`;
  if (file.size > MAX_BYTES) return `${file.name} pesa más de 50 MB`;
  return null;
}

/* ───────── nombres ───────── */

const SEPARATORS = /[\s_\-.]+/g;
/** La clave para comparar nombres: sin mayúsculas, tildes ni separadores. */
const keyOf = (name: string) => fold(name).replace(SEPARATORS, " ").trim();

/**
 * El nombre de un logo a partir del archivo: sin extensión, con espacios en vez de guiones y sin
 * el nombre del cliente adelante (en su ficha sobra). "Changan_Logo-Horizontal.svg" → "Logo Horizontal".
 */
export function logoNameOf(filename: string, brandName = "") {
  const stem = filename.replace(/\.[a-z0-9]+$/i, "");
  const name = stem.replace(SEPARATORS, " ").trim();
  const brand = keyOf(brandName);
  if (brand) {
    const words = name.split(" ");
    const brandWords = brand.split(" ").length;
    if (keyOf(words.slice(0, brandWords).join(" ")) === brand && words.length > brandWords) {
      const rest = words.slice(brandWords).join(" ");
      return rest.charAt(0).toUpperCase() + rest.slice(1);
    }
  }
  return name || stem || "Logo";
}

/** Las claves con las que un archivo nuevo cae en este logo: su nombre y el de sus archivos. */
function keysOf(logo: BrandLogo, brandName: string) {
  return new Set([keyOf(logo.name), ...logo.files.map((f) => keyOf(logoNameOf(f.name, brandName)))]);
}

/** Lo que el sistema no deja en un nombre de archivo. */
export const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "logo";

/** Con qué nombre se descarga un archivo: "Changan Horizontal.svg". */
export function downloadNameOf(brandName: string, logo: BrandLogo, file: LogoFile) {
  const ext = LOGO_FORMATS[file.format].exts[0];
  const name = keyOf(logo.name).startsWith(keyOf(brandName)) ? logo.name : `${brandName} ${logo.name}`;
  return `${safeFileName(name)}.${ext}`;
}

/* ───────── lo que se muestra ───────── */

/** El archivo que se muestra como vista previa, o null si no hay ninguno que el navegador pueda mostrar. */
export function previewOf(logo: BrandLogo): LogoFile | null {
  for (const format of PREVIEW_ORDER) {
    const file = logo.files.find((f) => f.format === format);
    if (file) return file;
  }
  return null;
}

export const sortFiles = (files: LogoFile[]) =>
  [...files].sort((a, b) => FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format));

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("es")} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} MB`;
}

/** "PNG · 2048 × 1024 px · 84 KB" (lo que se sabe). */
export function fileDetails(file: LogoFile) {
  const info = LOGO_FORMATS[file.format];
  return [
    info.label,
    info.vector ? "vectorial" : file.w && file.h ? `${file.w} × ${file.h} px` : "",
    file.size ? formatBytes(file.size) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Cuántos logos tienen cada formato, en el orden de siempre (para filtrar por formato). */
export function formatCounts(logos: BrandLogo[]) {
  return FORMAT_ORDER.map((format) => [format, logos.filter((l) => l.files.some((f) => f.format === format)).length] as const).filter(
    ([, n]) => n > 0
  );
}

/** Los logos de un grupo (null: los sin grupo), en su orden. */
export const logosIn = (logos: BrandLogo[], group: string | null) => logos.filter((l) => l.group === group);

/* ───────── subir ───────── */

const newId = () => Math.random().toString(36).slice(2, 10);

export type UploadPlan = {
  /** Cada archivo con el logo al que va (uno que ya estaba o uno de `fresh`). */
  items: { file: File; format: LogoFormat; target: string }[];
  /** Los logos nuevos, todavía sin archivos. */
  fresh: BrandLogo[];
};

/**
 * A qué logo va cada archivo. Con `into`, todos a ese logo. Si no, por el nombre: los que se llaman
 * igual entre sí, o igual que un logo que ya estaba, son el mismo logo. Los nuevos van a `group`.
 */
export function planUpload(
  files: File[],
  logos: BrandLogo[],
  { group, into, brandName }: { group: string | null; into?: string; brandName: string }
): UploadPlan {
  const items: UploadPlan["items"] = [];
  const fresh: BrandLogo[] = [];
  const known = logos.map((logo) => ({ id: logo.id, keys: keysOf(logo, brandName) }));
  const made = new Map<string, string>();

  for (const file of files) {
    const format = formatOf(file);
    if (!format) continue;
    if (into) {
      items.push({ file, format, target: into });
      continue;
    }
    const name = logoNameOf(file.name, brandName);
    const key = keyOf(name);
    let target = known.find((k) => k.keys.has(key))?.id ?? made.get(key);
    if (!target) {
      target = newId();
      made.set(key, target);
      fresh.push({ id: target, name, group, bg: "light", files: [] });
    }
    items.push({ file, format, target });
  }
  return { items, fresh };
}

export type Uploaded = { target: string; file: LogoFile; bg?: LogoBg };

/**
 * Suma lo que se subió. Cada logo tiene un archivo por formato: uno nuevo del mismo formato
 * reemplaza al anterior. Los logos nuevos toman el fondo que le sienta a su vista previa.
 */
export function applyUploads(logos: BrandLogo[], fresh: BrandLogo[], uploaded: Uploaded[]) {
  const freshIds = new Set(fresh.map((l) => l.id));
  const had = new Map(logos.map((l) => [l.id, new Set(l.files.map((f) => f.format))]));
  const batch = new Set(uploaded.map((u) => u.file.path));
  const byId = new Map([...logos, ...fresh].map((l) => [l.id, { ...l, files: [...l.files] }]));
  /** Subidos que no quedaron (otro del mismo formato, en la misma tanda, los reemplazó). */
  const discarded: string[] = [];
  const extra = new Set<string>();
  const replaced = new Set<string>();

  for (const up of uploaded) {
    const logo = byId.get(up.target);
    if (!logo) {
      discarded.push(up.file.path);
      continue;
    }
    const prev = logo.files.find((f) => f.format === up.file.format);
    if (prev && batch.has(prev.path)) discarded.push(prev.path);
    logo.files = sortFiles([...logo.files.filter((f) => f.format !== up.file.format), up.file]);
    const before = had.get(logo.id);
    if (before) (before.has(up.file.format) ? replaced : extra).add(`${logo.id}:${up.file.format}`);
  }

  const next = [...byId.values()]
    .filter((l) => l.files.length)
    .map((l) => {
      if (!freshIds.has(l.id)) return l;
      // El fondo que le sienta a su vista previa (un logo blanco va sobre oscuro).
      const preview = previewOf(l);
      return { ...l, bg: uploaded.find((u) => u.file.path === preview?.path)?.bg ?? l.bg };
    });
  const created = next.filter((l) => freshIds.has(l.id));
  return { logos: next, created, discarded, extra: extra.size, replaced: replaced.size };
}

/** "3 logos nuevos · 2 formatos sumados" */
export function uploadSummary({ created, extra, replaced }: { created: number; extra: number; replaced: number }) {
  return [
    created ? `${created} ${created === 1 ? "logo nuevo" : "logos nuevos"}` : "",
    extra ? `${extra} ${extra === 1 ? "formato sumado" : "formatos sumados"}` : "",
    replaced ? `${replaced} ${replaced === 1 ? "archivo reemplazado" : "archivos reemplazados"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ───────── ordenar y agrupar ───────── */

/** Lleva un logo a un grupo (null: sin grupo). Con `before`, queda antes de ese; si no, al final. */
export function moveLogo(logos: BrandLogo[], id: string, group: string | null, before?: string | null): BrandLogo[] {
  const logo = logos.find((l) => l.id === id);
  if (!logo || id === before) return logos;
  const rest = logos.filter((l) => l.id !== id);
  const moved = { ...logo, group };
  let at = before ? rest.findIndex((l) => l.id === before) : -1;
  if (at < 0) {
    // Después del último de ese grupo (o al final de todo, si está vacío).
    const last = rest.map((l) => l.group).lastIndexOf(group);
    at = last < 0 ? rest.length : last + 1;
  }
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/**
 * Junta dos logos en uno (el de `into`, que conserva su nombre). Si los dos tienen el mismo
 * formato, queda el de `into`: devuelve cuáles se descartan.
 */
export function mergeLogos(logos: BrandLogo[], from: string, into: string) {
  const source = logos.find((l) => l.id === from);
  const target = logos.find((l) => l.id === into);
  if (!source || !target || from === into) return { logos, dropped: [] as LogoFile[] };
  const dropped = source.files.filter((f) => target.files.some((t) => t.format === f.format));
  const files = sortFiles([...target.files, ...source.files.filter((f) => !dropped.includes(f))]);
  return {
    logos: logos.filter((l) => l.id !== from).map((l) => (l.id === into ? { ...l, files } : l)),
    dropped,
  };
}

export function addGroup(groups: LogoGroup[], name: string): { groups: LogoGroup[]; id: string } {
  const id = newId();
  return { groups: [...groups, { id, name: name.trim().slice(0, 60) || "Grupo" }], id };
}

/** Sube o baja un grupo un lugar. */
export function shiftGroup(groups: LogoGroup[], id: string, by: -1 | 1) {
  const i = groups.findIndex((g) => g.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= groups.length) return groups;
  const next = [...groups];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Nombres que suelen tener los grupos de un manual de marca, para crear uno de un click. */
export const GROUP_SUGGESTIONS = ["Principal", "Horizontal", "Vertical", "Isotipo", "Monocromo", "Negativo", "Sellos y versiones"];

/* ───────── archivos en el bucket ───────── */

/** Todos los archivos del bucket que usa un cliente: su logo de arriba y los de sus logos. */
export function logoPaths(brand: Pick<Brand, "logo_path" | "logos">) {
  const paths = new Set<string>();
  if (brand.logo_path) paths.add(brand.logo_path);
  for (const logo of brand.logos ?? []) for (const file of logo.files) paths.add(file.path);
  return paths;
}

/** Los archivos que `before` usaba y `after` ya no: se pueden borrar del bucket. */
export function orphanedPaths(before: Pick<Brand, "logo_path" | "logos">, after: Pick<Brand, "logo_path" | "logos">) {
  const still = logoPaths(after);
  return [...logoPaths(before)].filter((p) => !still.has(p));
}

/** El archivo es uno de sus logos (no se borra al cambiar el logo de arriba). */
export const inLibrary = (brand: Pick<Brand, "logos">, path: string | null | undefined) =>
  !!path && (brand.logos ?? []).some((l) => l.files.some((f) => f.path === path));

/* ───────── lo que viene de la base ───────── */

const BGS: LogoBg[] = ["light", "dark", "brand"];
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined);

function cleanFile(value: unknown): LogoFile | null {
  const f = value as Partial<LogoFile> | null;
  if (!f || !isFormat(f.format) || typeof f.path !== "string" || typeof f.url !== "string" || !f.path || !f.url) return null;
  return {
    format: f.format,
    path: f.path,
    url: f.url,
    name: typeof f.name === "string" && f.name ? f.name : f.path,
    size: num(f.size) ?? 0,
    w: num(f.w),
    h: num(f.h),
  };
}

export function cleanGroups(value: unknown): LogoGroup[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((g) => {
    if (!g || typeof g.id !== "string" || !g.id || seen.has(g.id)) return [];
    seen.add(g.id);
    return [{ id: g.id, name: typeof g.name === "string" && g.name.trim() ? g.name : "Grupo" }];
  });
}

/** Los logos tal como vinieron (jsonb: puede venir cualquier cosa). Un logo sin archivos no queda. */
export function cleanLogos(value: unknown, groups: LogoGroup[]): BrandLogo[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set(groups.map((g) => g.id));
  const seen = new Set<string>();
  return value.flatMap((l) => {
    if (!l || typeof l.id !== "string" || !l.id || seen.has(l.id)) return [];
    const files = Array.isArray(l.files) ? sortFiles(l.files.map(cleanFile).filter((f: LogoFile | null): f is LogoFile => !!f)) : [];
    if (!files.length) return [];
    seen.add(l.id);
    return [
      {
        id: l.id,
        name: typeof l.name === "string" && l.name.trim() ? l.name : "Logo",
        group: typeof l.group === "string" && ids.has(l.group) ? l.group : null,
        bg: BGS.includes(l.bg) ? l.bg : "light",
        files,
      },
    ];
  });
}

/** El logo de arriba como un logo de la lista (para sumarlo si no está). null si no se puede. */
export function faceAsLogo(brand: Pick<Brand, "logo_url" | "logo_path" | "logo_bg" | "logo_from">): BrandLogo | null {
  if (!brand.logo_url || !brand.logo_path || brand.logo_from) return null;
  const format = formatOf({ name: brand.logo_path, type: "" });
  if (!format) return null;
  return {
    id: newId(),
    name: "Logo",
    group: null,
    bg: brand.logo_bg ?? "light",
    files: [{ format, path: brand.logo_path, url: brand.logo_url, name: brand.logo_path, size: 0 }],
  };
}

/* ───────── descargar ───────── */

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Baja un archivo con su nombre. Si no se puede leer (ej: sin conexión), lo abre en otra pestaña. */
export async function downloadLogoFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    saveBlob(await res.blob(), filename);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/**
 * Un .zip con esos archivos. `path` es dónde va cada uno adentro ("Principal/Changan Horizontal.svg");
 * si dos se llaman igual, el segundo lleva un número. Devuelve también cuántos no se pudieron leer.
 */
export async function zipLogoFiles(entries: { path: string; url: string }[]) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set<string>();
  const unique = (path: string) => {
    let name = path;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = path.replace(/(\.[a-z0-9]+)?$/i, ` ${n}$1`);
    used.add(name.toLowerCase());
    return name;
  };
  const named = entries.map((e) => ({ ...e, path: unique(e.path) }));
  const read = await Promise.all(
    named.map(async (e) => {
      try {
        const res = await fetch(e.url);
        if (!res.ok) return false;
        zip.file(e.path, await res.blob());
        return true;
      } catch {
        return false;
      }
    })
  );
  const failed = read.filter((ok) => !ok).length;
  return { blob: await zip.generateAsync({ type: "blob" }), failed };
}
