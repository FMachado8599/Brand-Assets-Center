import crypto from "node:crypto";
import { get } from "@vercel/blob";
import { DownloadError } from "./http.server";
import type { Link } from "./links";
import type { MediaInfo, YoutubeQuality } from "./types";

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

let cached: { url: string; at: number } | null = null;

/**
 * La dirección del túnel de Cloudflare, que cambia cada vez que arranca el servicio: la lee del Blob store
 * de Vercel (se guarda un rato en memoria para no leerla en cada pedido).
 */
async function announcedUrl() {
  if (cached && Date.now() - cached.at < 30_000) return cached.url;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new DownloadError("YouTube todavía no está configurado: falta conectar el Blob store en Vercel (ver README, Descargas).", 501);
  }
  for (const access of ["private", "public"] as const) {
    try {
      const blob = await get(BLOB_PATH, { access, useCache: false });
      if (blob?.statusCode !== 200) break;
      const { url } = JSON.parse(await new Response(blob.stream).text()) as { url?: string };
      if (!url) break;
      cached = { url: url.replace(/\/+$/, ""), at: Date.now() };
      return cached.url;
    } catch {
      /* el store es del otro tipo (público o privado): se prueba el siguiente */
    }
  }
  throw new DownloadError("El servicio de YouTube todavía no avisó su dirección. ¿Está abierto en la PC?", 503);
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

export async function getYoutubeInfo(link: Link): Promise<MediaInfo> {
  const { worker, secret } = await config();
  const id = link.id!;

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
    youtube: { worker, token: sign(id, secret), qualities: data.qualities, audio: data.audio },
  };
}

function sign(id: string, secret: string) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_HOURS * 3600;
  const sig = crypto.createHmac("sha256", secret).update(`${id}.${exp}`).digest("base64url");
  return `${id}.${exp}.${sig}`;
}
