import { safeFileName } from "@/lib/downloads/links";
import { getJson } from "@/hooks/usePagedSearch";
import type { Icon, IconFormat, IconPage, PngSize, Shape } from "./iconos";

/** Una página de resultados. Lo usa Íconos y lo puede usar cualquier herramienta. */
export function fetchIcons(term: string, shape: Shape, page: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ pagina: String(page) });
  if (term) params.set("q", term);
  if (shape) params.set("forma", shape);
  return getJson<IconPage>(`/api/library/iconos?${params}`, signal);
}

/**
 * Cada archivo se pide una sola vez por página abierta: copiar el SVG y después bajarlo no gasta dos
 * descargas de Magnific. Si falla, se olvida, así se puede reintentar.
 */
const files = new Map<string, Promise<Blob>>();

export function iconBlob(icon: Icon, format: IconFormat, size: PngSize): Promise<Blob> {
  const key = `${icon.id}:${format}:${format === "png" ? size : ""}`;
  let file = files.get(key);
  if (!file) {
    file = (async () => {
      const res = await fetch("/api/library/iconos/descarga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: icon.id, formato: format, tam: size }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || typeof body?.file !== "string") throw new Error(body?.error ?? `Error ${res.status}`);
      const got = await fetch(body.file);
      if (!got.ok) throw new Error(got.status === 410 ? "El link de Magnific venció: reintentá" : "No se pudo bajar el ícono");
      const blob = await got.blob();
      return new Blob([blob], { type: format === "svg" ? "image/svg+xml" : "image/png" });
    })();
    files.set(key, file);
    file.catch(() => files.delete(key));
  }
  return file;
}

export const iconFileName = (icon: Icon, format: IconFormat, size: PngSize) =>
  `${safeFileName(icon.name)}${format === "png" ? ` ${size}px` : ""}.${format}`;

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Se libera un rato después: si se libera enseguida, Safari pierde la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadIcon(icon: Icon, format: IconFormat, size: PngSize) {
  saveBlob(await iconBlob(icon, format, size), iconFileName(icon, format, size));
}

const canWrite = () => typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";

/**
 * El SVG se copia como texto (el código): Figma e Illustrator lo pegan en vectores, y un editor de código
 * lo pega tal cual. La promesa va directo al ClipboardItem: Safari exige armarlo en el mismo click.
 */
export async function copySvg(icon: Icon) {
  const text = iconBlob(icon, "svg", 512).then(async (b) => new Blob([await b.text()], { type: "text/plain" }));
  if (canWrite()) await navigator.clipboard.write([new ClipboardItem({ "text/plain": text })]);
  else await navigator.clipboard.writeText(await (await text).text());
}

export async function copyPng(icon: Icon, size: PngSize) {
  if (!canWrite()) throw new Error("Este navegador no deja copiar imágenes");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": iconBlob(icon, "png", size) })]);
}
