"use client";

import { processAudio } from "./audio.client";
import { DriveError, uploadToDrive } from "./drive.client";
import { downloadName } from "./links";
import type { RegistroDescarga } from "./registro";
import { isDirectTarget, isVideoTarget, type SaveTarget } from "./targets";
import type { AudioMode, SaveSettings, YoutubeSource } from "./types";

/**
 * Guardar algo de la lista: un archivo de un posteo, un video de YouTube en una calidad, o una portada.
 *
 *  1. De dónde sale: Instagram, Pinterest y las portadas pasan por /api/descargas/file (así salen con su
 *     nombre); los videos de YouTube se preparan en el servicio de la PC y se bajan directo de ahí.
 *  2. Se baja a la memoria de la página: así, si algo falla, el error se ve en la fila (y no como una descarga
 *     fallida del navegador), y varios archivos se pueden juntar en un .zip. La excepción son los videos de
 *     YouTube que van solo a la compu: pueden pesar cientos de MB y los baja el navegador directo de la PC.
 *  3. Si hay que sacar o separar el audio (y no es YouTube, que ya viene así), se procesa en el navegador.
 *  4. A Drive se sube cada archivo. A la compu va uno solo tal cual, o varios en un .zip (saveToComputer):
 *     los navegadores frenan varias descargas seguidas (Chrome pide permiso y, hasta que se le contesta, no
 *     baja ninguna más, ni siquiera las de a una), así que un carrusel o "Descargar todo" es una sola descarga.
 */

export type Progress = { label: string; percent?: number };

/** Un archivo ya bajado, para guardar en la compu. `folder`: su carpeta dentro del .zip. */
export type FetchedFile = { name: string; blob: Blob; folder?: string };

export function fileHref(file: { url: string }, name: string) {
  return `/api/descargas/file?${new URLSearchParams({ src: file.url, name })}`;
}

/**
 * Baja un target y lo sube a Drive si corresponde. Lo que va a la compu lo devuelve en `file` (para guardarlo
 * solo o en el .zip), salvo los videos de YouTube que van solo a la compu: esos ya los bajó el navegador.
 */
export async function saveTarget(
  target: SaveTarget,
  settings: SaveSettings,
  driveToken: string | undefined,
  onProgress: (p: Progress) => void
): Promise<{ name: string; driveUrl?: string; bytes?: number; file?: FetchedFile }> {
  const { info, file, cover } = target;
  const audio: AudioMode = isVideoTarget(target) ? settings.audio : "con";
  const ext = cover ? cover.ext : audio === "solo" ? "m4a" : info.youtube ? "mp4" : file!.ext;
  const name = downloadName(info, ext, { file, audio, cover: !!cover });
  const toComputer = settings.destino !== "drive";
  const toDrive = settings.destino !== "compu";
  if (toDrive && (!settings.carpeta || !driveToken)) throw new DriveError("Elegí la carpeta de Drive en las opciones.");

  const href = cover
    ? fileHref(cover, name)
    : info.youtube
      ? await prepareYoutube(info.youtube, audio, target.quality, name, onProgress)
      : fileHref(file!, name);

  if (isDirectTarget(target, settings.destino)) {
    clickDownload(href, name);
    return { name };
  }

  let blob = await fetchBlob(href, (percent) => onProgress({ label: "Bajando", percent }));
  if (!cover && !info.youtube && audio !== "con") {
    const label = audio === "sin" ? "Sacando el audio" : "Separando el audio";
    blob = await processAudio(blob, audio, (percent) => onProgress({ label, percent }));
  }

  let driveUrl: string | undefined;
  if (toDrive) {
    const uploaded = await uploadToDrive(blob, name, settings.carpeta!.id, driveToken!, (percent) =>
      onProgress({ label: "Subiendo a Drive", percent })
    );
    driveUrl = uploaded.url;
  }
  return { name, driveUrl, bytes: blob.size, file: toComputer ? { name, blob } : undefined };
}

/**
 * Lo que va a la compu: un archivo se guarda tal cual; varios, en un .zip sin comprimir (fotos y videos ya
 * vienen comprimidos, así que se arma al instante). Devuelve cuántos archivos guardó.
 */
export async function saveToComputer(files: FetchedFile[], zipName: string) {
  if (!files.length) return 0;
  if (files.length === 1) {
    saveBlob(files[0].blob, files[0].name);
    return 1;
  }
  const { downloadZip } = await import("client-zip");
  const used = new Set<string>();
  const now = new Date();
  const entries = files.map((f) => ({ name: uniquePath(f.folder ? `${f.folder}/${f.name}` : f.name, used), input: f.blob, lastModified: now }));
  saveBlob(await downloadZip(entries).blob(), zipName.endsWith(".zip") ? zipName : `${zipName}.zip`);
  return files.length;
}

/** Dos posteos pueden llamarse igual: el segundo pasa a "… (2).jpg". */
function uniquePath(path: string, used: Set<string>) {
  let candidate = path;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = path.replace(/(\.\w+)?$/, (ext) => ` (${n})${ext}`);
  used.add(candidate.toLowerCase());
  return candidate;
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
  if (!res.ok || !res.body) throw new Error(await failureMessage(res));

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

/** Lo que explica el servidor (la ruta de archivos responde texto; el servicio de YouTube, JSON). */
async function failureMessage(res: Response) {
  const type = res.headers.get("content-type") ?? "";
  let text = "";
  try {
    if (type.startsWith("text/plain")) text = (await res.text()).trim();
    else if (type.includes("json")) text = String(((await res.json()) as { error?: unknown })?.error ?? "").trim();
  } catch {
    /* sin explicación: va la genérica */
  }
  if (text && text.length <= 200) return text;
  if (res.status === 410) return "El link del archivo venció: sacá la fila y volvé a pegar el link.";
  return `No se pudo bajar el archivo (${res.status}).`;
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
