import { BROWSER_HEADERS, contentLength, DownloadError } from "./http.server";
import { clip, isPinterestHost, isPinterestMedia, PIN_PATH, type Link } from "./links";
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

/**
 * Primero la página del pin: Pinterest publica el pin como schema.org para los buscadores (VideoObject o
 * SocialMediaPosting), con el título y la imagen original. Pero a los servidores en la nube (Vercel) a veces
 * les manda la página sin esos datos: entonces se usa la API de los embeds de Pinterest (la que usan los
 * sitios para mostrar un pin), que trae el video y la imagen sin sesión.
 */
export async function getPinterestInfo(link: Link): Promise<MediaInfo> {
  const id = link.id ?? (await resolveShortLink(link.url));
  const pageUrl = `https://www.pinterest.com/pin/${id}/`;

  let problem: DownloadError;
  try {
    const res = await fetch(pageUrl, { headers: BROWSER_HEADERS, cache: "no-store" });
    if (res.ok) {
      const html = await res.text();
      const nodes = ldNodes(html);
      const post = nodes.find((n) => n["@type"] === "SocialMediaPosting" && n.image);
      const video = nodes.find((n) => n["@type"] === "VideoObject" && n.contentUrl);
      if (video) return await videoInfo(id, pageUrl, video, post?.image);
      if (post) return await imageInfo(id, pageUrl, post);
      // Pinterest responde 200 aunque el pin no exista: la página simplemente no trae el contenido.
      problem = new DownloadError("No encontré nada para bajar en ese pin: puede estar borrado o ser privado.", 422);
      console.warn(`[descargas/pinterest] la página del pin ${id} no trajo datos (${html.length} bytes): pruebo la API de embeds`);
    } else {
      problem =
        res.status === 404
          ? new DownloadError("Ese pin no existe o es privado.", 404)
          : new DownloadError(`Pinterest respondió ${res.status}. Probá de nuevo en un rato.`);
      console.warn(`[descargas/pinterest] la página del pin ${id} respondió ${res.status}: pruebo la API de embeds`);
    }
  } catch (err) {
    problem = err instanceof DownloadError ? err : new DownloadError("No pude abrir el pin. Probá de nuevo en un rato.");
  }

  const fallback = await fromWidgets(id, pageUrl).catch((err) => {
    console.warn(`[descargas/pinterest] la API de embeds tampoco sirvió para el pin ${id}:`, err instanceof Error ? err.message : err);
    return null;
  });
  if (fallback) return fallback;
  throw problem;
}

/* ───────────── API de embeds ───────────── */

type WidgetImage = { url: string; width?: number; height?: number };
type WidgetVideo = { url: string; width?: number; height?: number; duration?: number; thumbnail?: string };
type WidgetPin = {
  id: string;
  description?: string | null;
  images?: Record<string, WidgetImage> | null;
  videos?: { video_list?: Record<string, WidgetVideo> } | null;
  story_pin_data?: unknown;
  pinner?: { full_name?: string } | null;
  native_creator?: { full_name?: string } | null;
};

/** widgets.pinterest.com: los datos del pin en JSON (unos KB, contra el 1 MB y pico de la página). */
async function fromWidgets(id: string, pageUrl: string): Promise<MediaInfo | null> {
  const res = await fetch(`https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${id}`, {
    headers: BROWSER_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`respondió ${res.status}`);
  const pin = ((await res.json()) as { data?: WidgetPin[] }).data?.find((p) => p?.id === id);
  if (!pin) return null;

  const text = decodeEntities(pin.description ?? "").trim();
  // Los Idea Pins pueden tener título propio.
  const storyTitle = (pin.story_pin_data as { metadata?: { pin_title?: string | null } } | null)?.metadata?.pin_title?.trim();
  const author = pin.native_creator?.full_name || pin.pinner?.full_name || undefined;
  const small = pin.images?.["236x"]?.url ?? pin.images?.["237x"]?.url;
  const image = await originalImage(pin.images);
  // Los "Idea Pins" guardan el video en sus páginas y bloques (story_pin_data), no en videos.
  const video = await bestVideo([...Object.values(pin.videos?.video_list ?? {}), ...videoLists(pin.story_pin_data)]);

  if (video) {
    const thumb = video.thumbnail && isPinterestMedia(video.thumbnail) ? { url: video.thumbnail, ext: imageExt(video.thumbnail) } : undefined;
    return {
      platform: "pinterest",
      id,
      pageUrl,
      title: storyTitle || (firstLine(text) ?? "Video de Pinterest"),
      author,
      caption: text || undefined,
      thumbnail: small ?? video.thumbnail,
      duration: video.duration ? Math.round(video.duration / 1000) || undefined : undefined,
      files: [
        {
          kind: "video",
          url: video.url,
          ext: "mp4",
          width: video.width,
          height: video.height,
          size: await contentLength(video.url),
          cover: image ?? thumb,
        },
      ],
    };
  }
  if (image) {
    return {
      platform: "pinterest",
      id,
      pageUrl,
      title: storyTitle || (firstLine(text) ?? "Imagen de Pinterest"),
      author,
      caption: text || undefined,
      thumbnail: small ?? image.url,
      files: [{ kind: "image", url: image.url, ext: image.ext, size: await contentLength(image.url) }],
    };
  }
  return null;
}

/**
 * El MP4 más grande. Si solo hay HLS (.m3u8, que no se baja como un archivo), Pinterest igual tiene el MP4 de
 * 720 en la ruta de al lado (hls/…/X.m3u8 → expMp4/…/X_720w.mp4): se prueba que exista.
 */
async function bestVideo(videos: WidgetVideo[]) {
  const mp4 = videos
    .filter((v) => v?.url && isPinterestMedia(v.url))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  if (mp4) return mp4;
  for (const v of videos) {
    const path = v?.url?.match(/^https:\/\/(v\d*\.pinimg\.com)\/videos\/iht\/hls\/([\w/]+)\.m3u8$/);
    if (!path) continue;
    const url = `https://${path[1]}/videos/iht/expMp4/${path[2]}_720w.mp4`;
    if (isPinterestMedia(url) && (await contentLength(url))) return { ...v, url };
  }
  return undefined;
}

/** Todos los videos de las listas que haya adentro (las páginas de un Idea Pin y sus bloques). */
function videoLists(data: unknown, depth = 0): WidgetVideo[] {
  if (!data || typeof data !== "object" || depth > 8) return [];
  const obj = data as Record<string, unknown>;
  const own = obj.video_list && typeof obj.video_list === "object" ? Object.values(obj.video_list as Record<string, WidgetVideo>) : [];
  return [...own, ...Object.values(obj).flatMap((value) => videoLists(value, depth + 1))];
}

/**
 * La API da la imagen hasta 564 px; la original está en la misma ruta bajo /originals/. Su extensión puede
 * no ser la de la chica (una original PNG tiene versiones chicas en JPG): se prueba cuál existe.
 */
async function originalImage(images: Record<string, WidgetImage> | null | undefined) {
  const biggest = Object.values(images ?? {}).sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
  const path = biggest?.match(/^https:\/\/i\.pinimg\.com\/\d+x\/([\w/]+)\.\w+$/)?.[1];
  if (!path) return undefined;
  const own = imageExt(biggest!);
  for (const ext of [own, ...["jpg", "png", "gif", "webp"].filter((e) => e !== own)]) {
    const url = `https://i.pinimg.com/originals/${path}.${ext}`;
    try {
      const res = await fetch(url, { method: "HEAD", headers: BROWSER_HEADERS, cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (res.ok && isPinterestMedia(url)) return { url, ext };
    } catch {
      /* se prueba la siguiente */
    }
  }
  return undefined;
}

function firstLine(text: string) {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean);
  return line ? clip(line, 100) : undefined;
}

function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/* ───────────── Página del pin ───────────── */

/**
 * `pinImage` es la imagen del pin (la portada que se ve en el feed, en tamaño original). Si falta, sirve la
 * miniatura del video, que es su primer cuadro con más compresión.
 */
async function videoInfo(id: string, pageUrl: string, video: LdNode, pinImage?: string): Promise<MediaInfo> {
  const src = video.contentUrl!;
  if (!isPinterestMedia(src)) throw new DownloadError("El video de ese pin tiene un formato que no reconozco.", 422);

  const width = parseInt(video.width ?? "", 10) || undefined;
  const height = parseInt(video.height ?? "", 10) || undefined;
  const coverSrc = [pinImage, video.thumbnailUrl].find((u): u is string => !!u && isPinterestMedia(u));
  const cover = coverSrc ? { url: coverSrc, ext: imageExt(coverSrc) } : undefined;
  const file: MediaFile = { kind: "video", url: src, ext: "mp4", width, height, size: await contentLength(src), cover };

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

  const ext = imageExt(src);
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

function imageExt(src: string) {
  return src.match(/\.(\w+)$/)![1].toLowerCase().replace("jpeg", "jpg");
}

function isoSeconds(iso: string | undefined) {
  const m = iso?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!m) return undefined;
  const total = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Math.round(Number(m[3] ?? 0));
  return total || undefined;
}
