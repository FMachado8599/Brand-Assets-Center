"use client";

import type { AudioMode } from "./types";

/**
 * Sacar el audio de un video, o quedarse solo con el audio, en el navegador y sin volver a comprimir:
 * mediabunny copia las pistas tal cual a un MP4 nuevo, así que tarda un instante y no pierde calidad.
 * (YouTube no pasa por acá: el servicio de la PC ya baja la versión pedida.)
 */
export async function processAudio(blob: Blob, mode: Exclude<AudioMode, "con">, onProgress?: (percent: number) => void) {
  const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } = await import("mediabunny");

  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  if (mode === "solo" && !(await input.getAudioTracks()).length) throw new Error("Ese video no tiene sonido.");

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const conversion = await Conversion.init({
    input,
    output,
    audio: mode === "sin" ? { discard: true } : undefined,
    video: mode === "solo" ? { discard: true } : undefined,
    showWarnings: false,
  });
  if (!conversion.isValid) throw new Error("No pude separar el audio de ese video.");
  if (onProgress) conversion.onProgress = (p) => onProgress(Math.round(p * 100));
  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("No pude separar el audio de ese video.");
  return new Blob([buffer], { type: mode === "solo" ? "audio/mp4" : "video/mp4" });
}
