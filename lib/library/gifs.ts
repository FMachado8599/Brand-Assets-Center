/** Lo que la página sabe de un GIF de GIPHY: lo justo para mostrarlo, copiarlo y bajarlo. */

export type GifKind = "gifs" | "stickers";

export type GifFile = { url: string; width: number; height: number; bytes: number | null };

export type Gif = {
  id: string;
  title: string;
  /** La página del GIF en giphy.com (para copiar el link). */
  page: string;
  user: string | null;
  /** Lo que se muestra en la grilla: 200 px de ancho, en WEBP si hay (pesa menos y conserva la transparencia). */
  preview: GifFile;
  /** Los archivos en tamaño original. Los stickers no traen MP4 (el MP4 no tiene transparencia). */
  files: { gif: GifFile; mp4: GifFile | null; webp: GifFile | null };
};

export type GifPage = { items: Gif[]; total: number; next: number | null };

export type GifFormat = "gif" | "mp4" | "webp";

/** Solo archivos de GIPHY: la ruta de descarga no baja otra cosa. */
export function isGiphyMedia(src: string) {
  return /^https:\/\/(media\d*\.giphy\.com|i\.giphy\.com)\//.test(src);
}
