import { BROWSER_HEADERS, contentLength, DownloadError } from "./http.server";
import { isPinterestHost, isPinterestMedia, PIN_PATH, type Link } from "./links";
import type { MediaFile, MediaInfo } from "./types";

const LD_JSON = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;

type LdNode = {
  "@type"?: string;
  // VideoObject (pin de video)
  contentUrl?: string;
  name?: string;
  thumbnailUrl?: string;
  duration?: string;
  width?: string;
  height?: string;
  creator?: { name?: string };
  // SocialMediaPosting (pin de imagen)
  image?: string;
  headline?: string;
  articleBody?: string;
  author?: { name?: string };
};

export async function getPinterestInfo(link: Link): Promise<MediaInfo> {
  const id = link.id ?? (await resolveShortLink(link.url));
  const pageUrl = `https://www.pinterest.com/pin/${id}/`;

  const res = await fetch(pageUrl, { headers: BROWSER_HEADERS, cache: "no-store" });
  if (res.status === 404) throw new DownloadError("Ese pin no existe o es privado.", 404);
  if (!res.ok) throw new DownloadError(`Pinterest respondió ${res.status}. Probá de nuevo en un rato.`);

  // Pinterest publica el pin como schema.org para los buscadores (VideoObject o SocialMediaPosting):
  // es lo más estable de la página.
  const nodes = ldNodes(await res.text());
  const video = nodes.find((n) => n["@type"] === "VideoObject" && n.contentUrl);
  if (video) return videoInfo(id, pageUrl, video);

  const post = nodes.find((n) => n["@type"] === "SocialMediaPosting" && n.image);
  if (post) return imageInfo(id, pageUrl, post);

  // Pinterest responde 200 aunque el pin no exista: la página simplemente no trae el contenido.
  throw new DownloadError("No encontré nada para bajar en ese pin: puede estar borrado o ser privado.", 422);
}

async function videoInfo(id: string, pageUrl: string, video: LdNode): Promise<MediaInfo> {
  const src = video.contentUrl!;
  if (!isPinterestMedia(src)) throw new DownloadError("El video de ese pin tiene un formato que no reconozco.", 422);

  const width = parseInt(video.width ?? "", 10) || undefined;
  const height = parseInt(video.height ?? "", 10) || undefined;
  const file: MediaFile = { kind: "video", url: src, ext: "mp4", width, height, size: await contentLength(src) };

  return {
    platform: "pinterest",
    id,
    pageUrl,
    title: video.name?.trim() || "Video de Pinterest",
    author: video.creator?.name,
    thumbnail: video.thumbnailUrl,
    duration: isoSeconds(video.duration),
    files: [file],
  };
}

async function imageInfo(id: string, pageUrl: string, post: LdNode): Promise<MediaInfo> {
  const src = post.image!;
  if (!isPinterestMedia(src)) throw new DownloadError("La imagen de ese pin tiene un formato que no reconozco.", 422);

  const ext = src.match(/\.(\w+)$/)![1].toLowerCase().replace("jpeg", "jpg");
  return {
    platform: "pinterest",
    id,
    pageUrl,
    title: post.headline?.trim() || "Imagen de Pinterest",
    author: post.author?.name,
    caption: post.articleBody?.trim() || undefined,
    // Las originales pueden pesar varios MB: la miniatura es la versión chica del mismo archivo.
    thumbnail: src.replace("/originals/", "/236x/"),
    files: [{ kind: "image", url: src, ext, size: await contentLength(src) }],
  };
}

/** pin.it → api.pinterest.com/url_shortener/… → pinterest.com/pin/<id>/sent/: se siguen las redirecciones sin bajar páginas. */
async function resolveShortLink(start: string) {
  let url = new URL(start);
  for (let hop = 0; hop < 5; hop++) {
    const id = url.pathname.match(PIN_PATH)?.[1];
    if (id) return id;
    if (!isPinterestHost(url.hostname)) break;
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "manual", cache: "no-store" });
    await res.body?.cancel();
    const next = res.headers.get("location");
    if (!next) break;
    url = new URL(next, url);
  }
  throw new DownloadError("No pude abrir ese link corto de Pinterest. Probá con el link completo del pin.", 404);
}

function ldNodes(html: string): LdNode[] {
  const nodes: LdNode[] = [];
  for (const [, body] of html.matchAll(LD_JSON)) {
    try {
      const data: unknown = JSON.parse(body);
      nodes.push(...((Array.isArray(data) ? data : [data]) as LdNode[]).filter(Boolean));
    } catch {
      /* un bloque roto no invalida los demás */
    }
  }
  return nodes;
}

function isoSeconds(iso: string | undefined) {
  const m = iso?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!m) return undefined;
  const total = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Math.round(Number(m[3] ?? 0));
  return total || undefined;
}
