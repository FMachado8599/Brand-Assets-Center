import type { MaterialKind } from "@/lib/types";

export const MATERIAL_KINDS: { value: MaterialKind; label: string; plural: string; short: string }[] = [
  { value: "documento", label: "Documento", plural: "Documentos", short: "Doc" },
  { value: "presentacion", label: "Presentación", plural: "Presentaciones", short: "Pres." },
  { value: "logo", label: "Logo", plural: "Logos", short: "Logo" },
  { value: "asset", label: "Asset", plural: "Assets", short: "Asset" },
];

export const kindLabel = (kind: MaterialKind) => MATERIAL_KINDS.find((k) => k.value === kind)?.label ?? "Archivo";

/** Hasta cuánto pesa un archivo (el bucket tiene el mismo tope) y cuántos puede tener un cliente. */
export const MATERIAL_MAX_BYTES = 30 * 1024 * 1024;
export const MATERIAL_MAX_FILES = 60;

/** Lo que el selector de archivos deja elegir. */
export const MATERIAL_ACCEPT = [
  ".pdf,.pptx,.docx,.txt,.md,.csv,.key,.ppt,.doc,.odp,.odt,.rtf",
  ".svg,.png,.jpg,.jpeg,.webp,.gif,.avif",
  ".ai,.eps,.psd,.fig,.zip,.mp4,.mov",
].join(",");

const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

const PRESENTATION_EXT = new Set(["pptx", "ppt", "key", "odp"]);
const DOCUMENT_EXT = new Set(["pdf", "docx", "doc", "txt", "md", "csv", "odt", "rtf"]);
const IMAGE_EXT = new Set(["svg", "png", "jpg", "jpeg", "webp", "gif", "avif"]);
const LOGO_NAME = /logo|isotipo|isologo|imagotipo|marca\b/i;

/** El tipo que más probable es por el archivo; se puede cambiar después. */
export function guessKind(file: Pick<File, "name">): MaterialKind {
  const ext = extOf(file.name);
  if (PRESENTATION_EXT.has(ext)) return "presentacion";
  if (DOCUMENT_EXT.has(ext)) return "documento";
  if (IMAGE_EXT.has(ext) && LOGO_NAME.test(file.name)) return "logo";
  return "asset";
}

export const isImage = (item: { file_name: string; mime?: string }) =>
  Boolean(item.mime?.startsWith("image/")) || IMAGE_EXT.has(extOf(item.file_name));

/** null si el archivo se puede sumar; si no, por qué. */
export function materialProblem(file: File): string | null {
  if (!file.size) return `«${file.name}» está vacío`;
  if (file.size > MATERIAL_MAX_BYTES) return `«${file.name}» pesa más de ${MATERIAL_MAX_BYTES / 1024 / 1024} MB`;
  return null;
}

/** "Manual de marca.pdf" → "Manual de marca". */
export function displayName(fileName: string) {
  const name = fileName.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_]+/g, " ").trim();
  return (name || fileName).slice(0, 200);
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} MB`;
}

/** Palabras aproximadas de un texto, a partir de las letras que se le leyeron. */
export const wordsOf = (chars: number) => Math.round(chars / 6);

export const formatWords = (chars: number) => `${wordsOf(chars).toLocaleString("es")} palabras`;

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/** El tipo del archivo; algunos navegadores no lo informan (ej: .md o .key). */
export const mimeOf = (file: File) => file.type || MIME_BY_EXT[extOf(file.name)] || "application/octet-stream";

/** Un nombre de archivo que el almacenamiento acepta: sin tildes, espacios ni signos raros. */
export function safeFileName(name: string) {
  const ext = extOf(name);
  const base = displayName(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "archivo"}${ext ? `.${ext.replace(/[^a-z0-9]/g, "")}` : ""}`;
}
