import { getJson } from "@/hooks/usePagedSearch";
import type { Gif, GifFile, GifFormat, GifKind, GifPage } from "./gifs";

/** Una página de resultados (o de tendencias, sin búsqueda). Lo usa GIFs y lo puede usar cualquier herramienta. */
export function fetchGifs(kind: GifKind, query: string, offset: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ tipo: kind, offset: String(offset) });
  if (query) params.set("q", query);
  return getJson<GifPage>(`/api/library/gifs?${params}`, signal);
}

export const gifName = (gif: Gif) => gif.title || `GIPHY ${gif.id}`;

/** El link que baja el archivo con su nombre (pasa por /api/library/gifs/archivo). */
export function gifDownloadUrl(gif: Gif, file: GifFile) {
  return `/api/library/gifs/archivo?${new URLSearchParams({ src: file.url, name: gifName(gif) })}`;
}

export function downloadGif(gif: Gif, format: GifFormat = "gif") {
  const file = gif.files[format] ?? gif.files.gif;
  const a = document.createElement("a");
  a.href = gifDownloadUrl(gif, file);
  a.download = "";
  a.click();
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Copiar un GIF animado: el portapapeles solo acepta imágenes en PNG (quieto), así que se copia el GIF como
 * HTML (una imagen que apunta a GIPHY) más su link. Gmail, Docs, Slides y Notion pegan la imagen animada;
 * Slack, WhatsApp web y los chats pegan el link y muestran el GIF.
 */
export async function copyGif(gif: Gif) {
  const { url, width, height } = gif.files.gif;
  const html = `<img src="${escapeHtml(url)}" alt="${escapeHtml(gifName(gif))}" width="${width}" height="${height}">`;
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([url], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      /* sin permiso para HTML: queda el link */
    }
  }
  await navigator.clipboard.writeText(url);
}

export const copyText = (text: string) => navigator.clipboard.writeText(text);
