import { isVideoTarget, type SaveTarget } from "./targets";
import type { AudioMode, Destination, Platform } from "./types";

/**
 * Una fila del registro de descargas (supabase/migracion-descargas-registro.sql): lo que se bajó, sin
 * datos de quién (eso lo pone la base con la sesión) ni de dónde (lo decide el servidor).
 */
export type RegistroDescarga = {
  plataforma: Platform;
  posteo_id: string;
  posteo_url: string;
  titulo: string | null;
  autor: string | null;
  tipo: "video" | "foto" | "portada" | "audio";
  numero: number | null;
  calidad: number | null;
  audio: Exclude<AudioMode, "solo"> | null;
  destino: Destination;
  bytes: number | null;
};

const TIPOS = new Set(["video", "foto", "portada", "audio"]);
const PLATAFORMAS = new Set(["youtube", "instagram", "pinterest"]);
const DESTINOS = new Set(["compu", "ambos", "drive"]);

/** Lo que se guardó de un target: `bytes` es el peso exacto si el archivo pasó por la página. */
export function registroDe(target: SaveTarget, audio: AudioMode, destino: Destination, bytes?: number): RegistroDescarga {
  const { info, file, cover } = target;
  const video = isVideoTarget(target);
  const tipo = cover ? "portada" : video ? (audio === "solo" ? "audio" : "video") : "foto";
  const quality = info.youtube?.qualities.find((q) => q.q === target.quality) ?? info.youtube?.qualities[0];
  const index = file ? info.files.indexOf(file) : -1;
  // Si no pasó por la página: lo que informó el origen (en YouTube, el estimado de esa calidad).
  const estimate = info.youtube
    ? cover
      ? undefined
      : audio === "solo"
        ? info.youtube.audio
        : audio === "sin"
          ? quality?.mute
          : quality?.video
    : cover
      ? undefined
      : file?.size;
  return {
    plataforma: info.platform,
    posteo_id: info.id,
    posteo_url: info.pageUrl,
    titulo: info.title || null,
    autor: info.author || null,
    tipo,
    numero: info.files.length > 1 && index >= 0 ? index + 1 : null,
    calidad: info.youtube && tipo === "video" ? (quality?.res ?? null) : null,
    audio: tipo === "video" ? (audio === "sin" ? "sin" : "con") : null,
    destino,
    bytes: bytes ?? estimate ?? null,
  };
}

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

/** Lo que llega del navegador, limpio; null si no sirve. */
export function limpiarRegistro(raw: unknown): RegistroDescarga | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const posteoId = text(r.posteo_id, 100);
  const posteoUrl = text(r.posteo_url, 300);
  if (
    !PLATAFORMAS.has(r.plataforma as string) ||
    !TIPOS.has(r.tipo as string) ||
    !DESTINOS.has(r.destino as string) ||
    !posteoId ||
    !posteoUrl?.startsWith("https://")
  ) {
    return null;
  }
  return {
    plataforma: r.plataforma as Platform,
    posteo_id: posteoId,
    posteo_url: posteoUrl,
    titulo: text(r.titulo, 300),
    autor: text(r.autor, 200),
    tipo: r.tipo as RegistroDescarga["tipo"],
    numero: int(r.numero, 1, 100),
    calidad: int(r.calidad, 1, 10000),
    audio: r.audio === "con" || r.audio === "sin" ? r.audio : null,
    destino: r.destino as Destination,
    bytes: int(r.bytes, 0, Number.MAX_SAFE_INTEGER),
  };
}
