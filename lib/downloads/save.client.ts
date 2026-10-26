"use client";

import { processAudio } from "./audio.client";
import { DriveError, uploadToDrive } from "./drive.client";
import { downloadName } from "./links";
import type { RegistroDescarga } from "./registro";
import { isVideoTarget, type SaveTarget } from "./targets";
import type { AudioMode, SaveSettings, YoutubeSource } from "./types";

/**
 * Guardar algo de la lista: un archivo de un posteo, un video de YouTube en una calidad, o una portada.
 *
 *  1. De dónde sale: Instagram, Pinterest y las portadas pasan por /api/descargas/file (así salen con su
 *     nombre); los videos de YouTube se preparan en el servicio de la PC y se bajan directo de ahí.
 *  2. Si hay que sacar o separar el audio (y no es YouTube, que ya viene así), se procesa en el navegador.
 *  3. A la compu, a Drive o a las dos. Solo a la compu y sin procesar, lo baja el navegador directamente
 *     (no pasa por la memoria de la página y se ve en sus descargas).
 */

export type Progress = { label: string; percent?: number };

export function fileHref(file: { url: string }, name: string) {
  return `/api/descargas/file?${new URLSearchParams({ src: file.url, name })}`;
}

export async function saveTarget(
  target: SaveTarget,
  settings: SaveSettings,
  driveToken: string | undefined,
  onProgress: (p: Progress) => void
): Promise<{ name: string; driveUrl?: string; bytes?: number }> {
  const { info, file, cover } = target;
  const audio: AudioMode = isVideoTarget(target) ? settings.audio : "con";
  const ext = cover ? cover.ext : audio === "solo" ? "m4a" : info.youtube ? "mp4" : file!.ext;
  const name = downloadName(info, ext, { file, audio, cover: !!cover });

  const href = cover
    ? fileHref(cover, name)
    : info.youtube
      ? await prepareYoutube(info.youtube, audio, target.quality, name, onProgress)
      : fileHref(file!, name);
  const processing = !cover && !info.youtube && audio !== "con";
  const toComputer = settings.destino !== "drive";
  const toDrive = settings.destino !== "compu";

  if (!toDrive && !processing) {
    clickDownload(href, name);
    return { name };
  }

  let blob = await fetchBlob(href, (percent) => onProgress({ label: "Bajando", percent }));
  if (processing) {
    const label = audio === "sin" ? "Sacando el audio" : "Separando el audio";
    blob = await processAudio(blob, audio as Exclude<AudioMode, "con">, (percent) => onProgress({ label, percent }));
  }
  if (toComputer) saveBlob(blob, name);
  if (!toDrive) return { name, bytes: blob.size };

  if (!settings.carpeta || !driveToken) throw new DriveError("Elegí la carpeta de Drive en las opciones.");
  const uploaded = await uploadToDrive(blob, name, settings.carpeta.id, driveToken, (percent) =>
    onProgress({ label: "Subiendo a Drive", percent })
  );
  return { name, driveUrl: uploaded.url, bytes: blob.size };
}

/* ───────────── YouTube ───────────── */

type WorkerJob = { id: string; status: string; phase: "video" | "audio" | null; percent: number; error?: string | null };

async function workerJson(url: string, init?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error("La PC que baja los videos de YouTube no responde. ¿Está prendida?");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error ?? `El servicio de YouTube respondió ${res.status}.`);
  return data as WorkerJob;
}

/** Le pide a la PC que prepare el archivo y espera a que esté: devuelve el link para bajarlo. */
async function prepareYoutube(yt: YoutubeSource, audio: AudioMode, quality: number | undefined, name: string, onProgress: (p: Progress) => void) {
  const mode = audio === "sin" ? "mute" : audio === "solo" ? "audio" : "video";
  let job = await workerJson(`${yt.worker}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // quien: el nombre de quien baja, firmado por la app; la PC lo muestra en su ventana.
    body: JSON.stringify({ t: yt.token, mode, q: quality ?? yt.qualities[0]?.q, quien: yt.quien }),
  });
  const token = encodeURIComponent(yt.token);
  while (job.status !== "done") {
    if (job.status === "error") throw new Error(job.error || "La PC no pudo bajar el video.");
    onProgress(describeJob(job, mode));
    await new Promise((r) => setTimeout(r, 800));
    job = await workerJson(`${yt.worker}/jobs/${job.id}?t=${token}`);
  }
  return `${yt.worker}/jobs/${job.id}/file?${new URLSearchParams({ t: yt.token, name })}`;
}

function describeJob(job: WorkerJob, mode: string): Progress {
  if (job.status === "queued") return { label: "En espera en la PC" };
  if (job.status === "processing") return { label: mode === "video" ? "Uniendo audio y video" : "Terminando el archivo" };
  return { label: job.phase === "audio" && mode === "video" ? "La PC baja el audio" : "La PC baja el video", percent: job.percent };
}

/* ───────────── Archivos ───────────── */

async function fetchBlob(href: string, onProgress: (percent: number) => void) {
  let res: Response;
  try {
    res = await fetch(href);
  } catch {
    throw new Error("Se cortó la conexión mientras se bajaba el archivo.");
  }
  if (res.status === 410) throw new Error("El link del archivo venció: sacá la fila y volvé a pegar el link.");
  if (!res.ok || !res.body) throw new Error(`No se pudo bajar el archivo (${res.status}).`);

  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(Math.round((received / total) * 100));
  }
  return new Blob(chunks, { type: res.headers.get("content-type") ?? "application/octet-stream" });
}

/**
 * Anota lo bajado en el registro de descargas (las métricas del estudio). No se espera ni se avisa si
 * falla: la descarga ya se hizo. keepalive: llega aunque se cierre la página.
 */
export function anotarDescargas(items: RegistroDescarga[]) {
  if (!items.length) return;
  fetch("/api/descargas/registro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
    keepalive: true,
  }).catch(() => {});
}

function clickDownload(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noreferrer";
  a.click();
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  clickDownload(url, name);
  // El navegador ya tomó el archivo: se libera un rato después (si se libera enseguida, Safari lo pierde).
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
