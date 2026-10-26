import crypto from "node:crypto";
import { get } from "@vercel/blob";
import { BROWSER_HEADERS, DownloadError } from "./http.server";
import type { Link } from "./links";
import type { MediaCover, MediaInfo, YoutubeQuality } from "./types";

/**
 * YouTube corta las descargas en buena calidad que salen de servidores en la nube: lo baja el servicio que
 * corre en la PC de la oficina (worker/youtube). Acá solo se le piden los datos del video (con la clave
 * compartida) y se firma el permiso con el que el navegador baja el archivo directo de esa PC.
 */

/** El permiso sirve para un solo video y vence a las 6 horas (después alcanza con volver a pegar el link). */
const TOKEN_HOURS = 6;

/** Donde el servicio anota su dirección pública cada vez que arranca (worker/youtube/server.mjs). */
const BLOB_PATH = "descargas/servicio-youtube.json";

async function config() {
  const secret = process.env.YOUTUBE_WORKER_SECRET?.trim();
  if (!secret) {
    throw new DownloadError("YouTube todavía no está configurado: falta el servicio de la PC (ver README, Descargas).", 501);
  }
  // Una dirección fija (en local, o si el servicio pasa a un servidor propio) manda sobre la anotada.
  const fixed = process.env.YOUTUBE_WORKER_URL?.trim().replace(/\/+$/, "");
  return { worker: fixed || (await announcedUrl()), secret };
}

/** Lo que anota el servicio: su dirección y la IP pública de la oficina (para saber quién baja desde ahí). */
export type Announcement = { url?: string; oficina?: { v4?: string | null; v6?: string | null } };

let cached: { data: Announcement | null; at: number } | null = null;

/**
 * Lo que el servicio anotó en el Blob store de Vercel al arrancar (la dirección del túnel cambia cada
 * vez). Se guarda un rato en memoria para no leerlo en cada pedido. null si no hay nada anotado.
 */
export async function announcement(): Promise<Announcement | null> {
  if (cached && Date.now() - cached.at < 30_000) return cached.data;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  let data: Announcement | null = null;
  for (const access of ["private", "public"] as const) {
    try {
      const blob = await get(BLOB_PATH, { access, useCache: false });
      if (blob?.statusCode !== 200) break;
      data = JSON.parse(await new Response(blob.stream).text()) as Announcement;
      break;
    } catch {
      /* el store es del otro tipo (público o privado): se prueba el siguiente */
    }
  }
  cached = { data, at: Date.now() };
  return data;
}

async function announcedUrl() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new DownloadError("YouTube todavía no está configurado: falta conectar el Blob store en Vercel (ver README, Descargas).", 501);
  }
  const url = (await announcement())?.url;
  if (!url) throw new DownloadError("El servicio de YouTube todavía no avisó su dirección. ¿Está abierto en la PC?", 503);
  return url.replace(/\/+$/, "");
}

type WorkerInfo = {
  id: string;
  title: string;
  channel?: string;
  duration?: number;
  live?: boolean;
  qualities: YoutubeQuality[];
  audio?: number;
};

/** Quién pide el video: el servicio de la PC lo muestra en vivo en su ventana. */
export type Requester = { name: string | null; email: string };

export async function getYoutubeInfo(link: Link, requester?: Requester | null): Promise<MediaInfo> {
  const { worker, secret } = await config();
  const id = link.id!;
  const cover = bestCover(id);

  let res: Response;
  try {
    res = await fetch(`${worker}/info?v=${id}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
      // yt-dlp tarda unos segundos en leer el video (resuelve el desafío de YouTube).
      signal: AbortSignal.timeout(40_000),
    });
  } catch {
    throw new DownloadError("La PC que baja los videos de YouTube no responde. ¿Está prendida y con el servicio abierto?", 503);
  }
  const data = (await res.json().catch(() => null)) as (WorkerInfo & { error?: string }) | null;
  if (res.status === 401) throw new DownloadError("La clave del servicio de YouTube no coincide con la de la app.", 502);
  if (!res.ok || !data) throw new DownloadError(data?.error ?? `El servicio de YouTube respondió ${res.status}.`, res.status >= 500 ? 502 : 422);
  if (data.live) throw new DownloadError("Es un vivo que todavía no terminó: se puede bajar cuando termine.", 422);
  if (!data.qualities.length) throw new DownloadError("Ese video no tiene ningún formato para bajar.", 422);

  return {
    platform: "youtube",
    id,
    pageUrl: `https://www.youtube.com/watch?v=${id}`,
    title: data.title?.trim() || "Video de YouTube",
    author: data.channel,
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    duration: data.duration,
    files: [],
    youtube: {
      worker,
      token: sign(id, secret),
      quien: requester ? signRequester(id, requester, secret) : undefined,
      qualities: data.qualities,
      audio: data.audio,
      cover: await cover,
    },
  };
}

/**
 * "<datos>.<firma>": nombre y mail de quien pide, firmados para este video con la clave compartida, así el
 * servicio puede confiar en el nombre que muestra. Va aparte del permiso (un servicio viejo lo ignora).
 */
function signRequester(id: string, requester: Requester, secret: string) {
  const data = Buffer.from(JSON.stringify({ n: requester.name, e: requester.email })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`quien.${id}.${data}`).digest("base64url");
  return `${data}.${sig}`;
}

/**
 * La miniatura más grande que tenga: maxresdefault (1280×720) no existe en todos los videos (YouTube
 * responde 404 con una imagen gris); sddefault y hqdefault sí, pero con franjas negras arriba y abajo.
 */
async function bestCover(id: string): Promise<MediaCover> {
  const sizes = [
    { name: "maxresdefault", width: 1280, height: 720 },
    { name: "sddefault", width: 640, height: 480 },
  ];
  for (const s of sizes) {
    const url = `https://i.ytimg.com/vi/${id}/${s.name}.jpg`;
    try {
      const res = await fetch(url, { method: "HEAD", headers: BROWSER_HEADERS, cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (res.ok) return { url, ext: "jpg", width: s.width, height: s.height };
    } catch {
      /* se prueba la siguiente */
    }
  }
  return { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, ext: "jpg", width: 480, height: 360 };
}

function sign(id: string, secret: string) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_HOURS * 3600;
  const sig = crypto.createHmac("sha256", secret).update(`${id}.${exp}`).digest("base64url");
  return `${id}.${exp}.${sig}`;
}
