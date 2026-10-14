import type { AudioMode, MediaFile, MediaInfo, Platform } from "./types";

/** `id` es null en los links cortos (pin.it): el pin recién se conoce siguiendo la redirección. */
export type Link = { platform: Platform; url: string; id: string | null };

export const PIN_PATH = /\/pin\/(?:[^/?#]*--)?(\d{5,})/;
/** /p/, /reel/, /reels/ y /tv/, con o sin el usuario adelante (instagram.com/<usuario>/reel/<código>/). */
const INSTAGRAM_PATH = /^\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]{5,})/;
const YOUTUBE_ID = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"]);
const URLISH = /(?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/gi;

export const NO_LINKS = "Pegá el link de un video de YouTube, un posteo o reel de Instagram, o un pin de Pinterest.";

export function isPinterestHost(host: string) {
  return host === "pin.it" || /(^|\.)pinterest(\.[a-z]{2,3}){1,2}$/.test(host);
}

export function parseLink(raw: string): Link | null {
  const text = raw.trim().replace(/[),.;:!?]+$/, "");
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");

  if (host === "instagram.com" || host === "instagr.am") {
    const code = url.pathname.match(INSTAGRAM_PATH)?.[1];
    return code ? { platform: "instagram", url: `https://www.instagram.com/p/${code}/`, id: code } : null;
  }

  if (host === "pin.it") {
    return url.pathname.length > 1 ? { platform: "pinterest", url: `https://pin.it${url.pathname}`, id: null } : null;
  }
  if (isPinterestHost(host)) {
    const id = url.pathname.match(PIN_PATH)?.[1];
    return id ? { platform: "pinterest", url: `https://www.pinterest.com/pin/${id}/`, id } : null;
  }

  let videoId: string | null = null;
  if (host === "youtu.be") videoId = url.pathname.split("/")[1] ?? null;
  else if (YOUTUBE_HOSTS.has(host)) {
    videoId = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)?.[1] ?? null;
  }
  return videoId && YOUTUBE_ID.test(videoId)
    ? { platform: "youtube", url: `https://www.youtube.com/watch?v=${videoId}`, id: videoId }
    : null;
}

/** Los links soportados que aparezcan en un texto pegado (un mensaje, una lista), sin repetir. */
export function findLinks(text: string): Link[] {
  return scanLinks(text).links;
}

/**
 * Como findLinks, y además cuenta los links que no son de ninguna plataforma soportada (para avisar).
 * Solo cuentan los que empiezan con http o www: un "topic.media" suelto en el texto no es un link.
 */
export function scanLinks(text: string) {
  const links: Link[] = [];
  let ignored = 0;
  // Links pegados sin espacio entre medio ("…/p/abc/https://…") se separan.
  for (const candidate of text.replace(/(\S)(https?:\/\/)/gi, "$1 $2").match(URLISH) ?? []) {
    const link = parseLink(candidate);
    if (!link) {
      if (/^(https?:\/\/|www\.)/i.test(candidate)) ignored++;
      continue;
    }
    if (!links.some((l) => l.url === link.url)) links.push(link);
  }
  return { links, ignored };
}

function httpsUrl(src: string) {
  try {
    const url = new URL(src);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Los MP4 del CDN de videos de Pinterest y las imágenes originales. */
export function isPinterestMedia(src: string) {
  const url = httpsUrl(src);
  if (!url) return false;
  if (/^v\d*\.pinimg\.com$/.test(url.hostname)) return /^\/videos\/[\w/.-]+\.mp4$/.test(url.pathname);
  return url.hostname === "i.pinimg.com" && /^\/originals\/[\w/.-]+\.(jpe?g|png|gif|webp)$/i.test(url.pathname);
}

/** Instagram sirve todo desde el CDN de Meta (instagram.f<ciudad>.fna.fbcdn.net, scontent.cdninstagram.com…). */
export function isInstagramMedia(src: string) {
  const url = httpsUrl(src);
  return !!url && /(^|\.)(fbcdn\.net|cdninstagram\.com)$/.test(url.hostname);
}

/** Lo único que baja el proxy de descargas: así no sirve para traer cualquier cosa de internet. */
export function isAllowedMedia(src: string) {
  return isPinterestMedia(src) || isInstagramMedia(src);
}

export function safeFileName(name: string) {
  return (
    name
      // Las letras "decoradas" de Instagram (𝗧𝗢𝗣𝗜𝗖) vuelven a ser letras comunes, y los emojis quedan afuera.
      .normalize("NFKC")
      .replace(/[\p{Extended_Pictographic}‍️]/gu, "")
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)
      .trim() || "descarga"
  );
}

/** Corta en el último espacio antes del límite, para no dejar una palabra por la mitad. */
export function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, "");
}

/**
 * El nombre con que se guarda: el del posteo, el número dentro del carrusel, y si se le sacó o se separó
 * el audio. `ext` es la del archivo que sale (un video convertido a solo audio termina en .m4a).
 */
export function downloadName(info: MediaInfo, ext: string, opts: { file?: MediaFile; audio?: AudioMode } = {}) {
  // En Instagram la cuenta dice de quién es y en YouTube el canal; en Pinterest es quien lo guardó, que no
  // importa. Los títulos de Pinterest además suelen arrastrar palabras clave después de un " | ": quedan afuera.
  const parts = info.platform === "pinterest" ? [info.title.split(" | ")[0]] : [info.author, info.title];
  // Sin puntuación al final: "…mucho después." no puede terminar en "después..mp4".
  const base = clip(safeFileName(parts.filter(Boolean).join(" - ")), 90).replace(/[\s.,;:!?¿¡…–—-]+$/, "") || "descarga";
  const index = opts.file ? info.files.indexOf(opts.file) : -1;
  const number = info.files.length > 1 && index >= 0 ? ` (${index + 1})` : "";
  const tag = opts.audio === "sin" ? " (sin audio)" : opts.audio === "solo" ? " (audio)" : "";
  return `${base}${number}${tag}.${ext}`;
}
