import https from "node:https";
import { BROWSER_UA, contentLength, DownloadError } from "./http.server";
import { clip, isInstagramMedia, type Link } from "./links";
import type { MediaFile, MediaInfo } from "./types";

/**
 * Instagram no tiene una API pública sin sesión, pero la página "embed" (la que usan los sitios para
 * insertar un posteo) trae los datos del posteo: el MP4 de los videos y reels, las fotos en su mayor
 * tamaño y todos los archivos de un carrusel. Las APIs internas (GraphQL, ?__a=1) piden iniciar sesión.
 */

type Resource = { src: string; config_width: number; config_height: number };

type IgNode = {
  __typename?: string;
  is_video?: boolean;
  video_url?: string;
  video_duration?: number;
  display_url?: string;
  display_resources?: Resource[];
  product_type?: string;
  owner?: { username?: string };
  edge_media_to_caption?: { edges?: { node?: { text?: string } }[] };
  edge_sidecar_to_children?: { edges?: { node: IgNode }[] };
};

type EmbedContext = { context?: { type?: string }; gql_data?: { shortcode_media?: IgNode } | null };

const CONTEXT_JSON = /"contextJSON":("(?:[^"\\]|\\.)*"|null)/;

export async function getInstagramInfo(link: Link): Promise<MediaInfo> {
  const code = link.id!;
  const html = await getEmbed(code);
  const pageUrl = `https://www.instagram.com/p/${code}/`;

  const raw = html.match(CONTEXT_JSON)?.[1];
  if (raw === undefined) throw unavailable();

  const ctx: EmbedContext | null = raw === "null" ? null : JSON.parse(JSON.parse(raw));
  const media = ctx?.gql_data?.shortcode_media;
  if (media) return fromGraph(code, pageUrl, media);
  // Las fotos sueltas vienen sin datos: solo el HTML del embed, con la imagen en todos sus tamaños.
  if (!ctx) return fromHtml(code, pageUrl, html);
  throw unavailable();
}

/**
 * Sin "Sec-Fetch-Mode: navigate" Instagram devuelve la app vacía en lugar del embed. El fetch() de Node
 * fija ese encabezado en "cors" y no deja cambiarlo: por eso este pedido va con https.
 */
function getEmbed(code: string) {
  return new Promise<string>((resolve, reject) => {
    const req = https.get(
      `https://www.instagram.com/p/${code}/embed/captioned/`,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
          "Sec-Fetch-Dest": "iframe",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "cross-site",
        },
        timeout: 10_000,
      },
      (res) => {
        if (res.statusCode === 404) {
          res.resume();
          return reject(unavailable());
        }
        if (res.statusCode !== 200) {
          res.resume();
          // Cuando desconfía de quien pregunta, redirige al login.
          const blocked = res.statusCode! >= 300 && res.statusCode! < 400;
          return reject(
            new DownloadError(
              blocked
                ? "Instagram no dejó leer el posteo (pidió iniciar sesión). Probá de nuevo en un rato."
                : `Instagram respondió ${res.statusCode}. Probá de nuevo en un rato.`
            )
          );
        }
        let html = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (html += chunk));
        res.on("end", () => resolve(html));
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new DownloadError("Instagram tardó demasiado en responder. Probá de nuevo.", 504)));
    req.on("error", reject);
  });
}

async function fromGraph(code: string, pageUrl: string, media: IgNode): Promise<MediaInfo> {
  const nodes = media.edge_sidecar_to_children?.edges?.map((e) => e.node) ?? [media];
  const files = nodes.map(toFile).filter((f): f is MediaFile => !!f);
  if (!files.length) throw unavailable();

  const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text?.trim() || undefined;
  const username = media.owner?.username;
  const kind = media.product_type === "clips" ? "Reel" : files.length > 1 ? "Carrusel" : media.is_video ? "Video" : "Foto";

  return {
    platform: "instagram",
    id: code,
    pageUrl,
    title: titleFrom(caption) ?? `${kind}${username ? ` de @${username}` : ""}`,
    author: username && `@${username}`,
    caption,
    thumbnail: thumbnailOf(media),
    duration: files.length === 1 && media.video_duration ? Math.round(media.video_duration) : undefined,
    files: await withSizes(files),
  };
}

function toFile(node: IgNode): MediaFile | null {
  const thumbnail = thumbnailOf(node);
  if (node.is_video) {
    // Las medidas que informa Instagram para los videos no son las del MP4 (dice 1024×1820 y el archivo es
    // 720×1280): mejor no mostrarlas.
    return node.video_url && isInstagramMedia(node.video_url)
      ? { kind: "video", url: node.video_url, ext: "mp4", thumbnail }
      : null;
  }
  const best = largest(node.display_resources ?? []);
  const src = best?.src ?? node.display_url;
  if (!src || !isInstagramMedia(src)) return null;
  return { kind: "image", url: src, ext: imageExt(src), width: best?.config_width, height: best?.config_height, thumbnail };
}

async function fromHtml(code: string, pageUrl: string, html: string): Promise<MediaInfo> {
  const img = html.match(/<img[^>]*class="EmbeddedMediaImage"[^>]*>/)?.[0];
  if (!img) throw unavailable();

  // srcset: "url 1080w,url 720w,…" (las URLs tienen comas solo dentro del query, nunca antes de un espacio).
  const sizes = decode(attr(img, "srcset") ?? "")
    .split(/,(?=https:)/)
    .map((part) => {
      const [src, w] = part.trim().split(/\s+/);
      return { src, width: parseInt(w, 10) || 0 };
    })
    .filter((s) => isInstagramMedia(s.src))
    .sort((a, b) => b.width - a.width);
  const src = sizes[0]?.src ?? decode(attr(img, "src") ?? "");
  if (!isInstagramMedia(src)) throw unavailable();

  const username = html.match(/class="UsernameText">([^<]+)</)?.[1];
  const caption = captionFromHtml(html);
  const thumb = [...sizes].reverse().find((s) => s.width >= 320)?.src ?? src;

  return {
    platform: "instagram",
    id: code,
    pageUrl,
    title: titleFrom(caption) ?? `Foto${username ? ` de @${username}` : ""}`,
    author: username && `@${username}`,
    caption,
    thumbnail: thumb,
    files: await withSizes([{ kind: "image", url: src, ext: imageExt(src), width: sizes[0]?.width || undefined, thumbnail: thumb }]),
  };
}

function withSizes(files: MediaFile[]) {
  return Promise.all(files.map(async (f) => ({ ...f, size: await contentLength(f.url) })));
}

/** La primera línea del texto del posteo, sin hashtags sueltos ni menciones al final. */
function titleFrom(caption: string | undefined) {
  const line = caption
    ?.split("\n")
    .map((l) => l.replace(/(?:\s*[#@][\p{L}\p{N}_.]+)+\s*$/u, "").trim())
    .find((l) => /[\p{L}\p{N}]/u.test(l));
  return line ? clip(line, 100) : undefined;
}

/** La versión de ~320 px: alcanza para la fila y no baja la foto entera. */
function thumbnailOf(node: IgNode) {
  const list = [...(node.display_resources ?? [])].sort((a, b) => a.config_width - b.config_width);
  return list.find((r) => r.config_width >= 320)?.src ?? node.display_url;
}

/** Instagram manda cada foto recortada en varias proporciones: la más grande es la original. */
function largest(list: Resource[]) {
  return list.reduce<Resource | undefined>(
    (best, r) => (!best || r.config_width * r.config_height > best.config_width * best.config_height ? r : best),
    undefined
  );
}

function imageExt(src: string) {
  const ext = new URL(src).pathname.match(/\.(jpe?g|png|webp|heic)$/i)?.[1].toLowerCase();
  return !ext || ext === "jpeg" ? "jpg" : ext;
}

function captionFromHtml(html: string) {
  const block = html.match(/<div class="Caption">([\s\S]*?)<div class="CaptionComments"/)?.[1];
  if (!block) return undefined;
  const text = decode(
    block
      .replace(/<a class="CaptionUsername"[\s\S]*?<\/a>/, "")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "")
  ).trim();
  return text || undefined;
}

function attr(tag: string, name: string) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

function decode(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function unavailable() {
  return new DownloadError("Ese posteo no está disponible: puede ser de una cuenta privada o haber sido borrado.", 404);
}
