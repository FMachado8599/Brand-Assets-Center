import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { frameDuration } from "./parse";
import { QUALITY_COLORS, type GifGroup, type GifSettings } from "./types";

/**
 * Arma el GIF en el navegador: cada frame se dibuja a la medida del grupo
 * (encajado, sin deformar, con fondo blanco), se reduce a una paleta propia y
 * se agrega con su duración. Nada sale de la computadora.
 *
 * Para que pese poco:
 *  - Desde el segundo frame, los píxeles idénticos al frame anterior se
 *    guardan transparentes: el GIF deja el píxel que ya estaba. En un banner
 *    el fondo, el logo y el botón casi nunca cambian, y eso comprime mucho.
 *  - Si hay peso máximo y "ajustar" está activo, se prueba con menos colores
 *    hasta que entre.
 */

export type RenderedGif = {
  blob: Blob;
  /** Colores por frame con los que quedó (puede ser menos que la calidad elegida, si se ajustó al peso). */
  colors: number;
  /** Si entra en el peso máximo (siempre true cuando no hay límite). */
  fits: boolean;
};

/** Escalones de colores que se prueban al ajustar al peso máximo. */
const FIT_STEPS = [256, 192, 160, 128, 96, 64, 48, 32];

type DrawnFrame = { data: Uint8ClampedArray; delay: number };

const yieldToBrowser = () => new Promise((r) => setTimeout(r, 0));

/** Dibuja cada frame una sola vez; los intentos de ajuste al peso reusan estos píxeles. */
async function drawFrames(group: GifGroup, settings: GifSettings): Promise<DrawnFrame[]> {
  const { width, height } = group;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("El navegador no permite dibujar en canvas");

  const frames: DrawnFrame[] = [];
  for (const frame of group.frames) {
    const bitmap = await createImageBitmap(frame.file);
    try {
      // Fondo blanco: un PNG con transparencia quedaría negro en el GIF.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      const scale = Math.min(width / bitmap.width, height / bitmap.height);
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      ctx.drawImage(bitmap, Math.floor((width - w) / 2), Math.floor((height - h) / 2), w, h);
    } finally {
      bitmap.close();
    }
    frames.push({ data: ctx.getImageData(0, 0, width, height).data, delay: frameDuration(frame, settings) });
  }
  return frames;
}

async function encode(frames: DrawnFrame[], width: number, height: number, loop: boolean, colors: number) {
  const gif = GIFEncoder();
  const total = width * height;
  let prev: Uint8ClampedArray | null = null;

  for (let i = 0; i < frames.length; i++) {
    const { data, delay } = frames[i];
    // 0 = repetir para siempre, -1 = una sola vez. Va solo en el primer frame.
    const repeat = i === 0 ? (loop ? 0 : -1) : undefined;
    // dispose 1 = "no borrar": el frame siguiente se dibuja encima y sus píxeles transparentes dejan ver este.
    const dispose = 1;

    if (!prev) {
      // El primero va completo: al repetir el loop, redibuja todo desde cero.
      const palette = quantize(data, colors);
      gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay, repeat, dispose });
    } else {
      const same = new Uint8Array(total);
      let changed = 0;
      for (let p = 0, o = 0; p < total; p++, o += 4) {
        if (data[o] === prev[o] && data[o + 1] === prev[o + 1] && data[o + 2] === prev[o + 2]) same[p] = 1;
        else changed++;
      }

      if (!changed) {
        // Idéntico al anterior: un frame todo transparente que solo suma tiempo.
        gif.writeFrame(new Uint8Array(total), width, height, {
          palette: [[0, 0, 0], [0, 0, 0]],
          delay,
          transparent: true,
          transparentIndex: 0,
          dispose,
        });
      } else {
        // La paleta se arma solo con lo que cambió: mejores colores para esa zona.
        const subset = new Uint8ClampedArray(changed * 4);
        for (let p = 0, o = 0, s = 0; p < total; p++, o += 4) {
          if (same[p]) continue;
          subset[s++] = data[o];
          subset[s++] = data[o + 1];
          subset[s++] = data[o + 2];
          subset[s++] = 255;
        }
        const palette = quantize(subset, Math.max(2, Math.min(colors, 256) - 1));
        const index = applyPalette(data, palette);
        const transparentIndex = palette.length;
        palette.push([0, 0, 0]);
        for (let p = 0; p < total; p++) if (same[p]) index[p] = transparentIndex;
        gif.writeFrame(index, width, height, { palette, delay, transparent: true, transparentIndex, dispose });
      }
    }

    prev = data;
    // Cede el hilo entre frames para que la interfaz no se congele con banners grandes.
    await yieldToBrowser();
  }

  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}

export async function renderGif(group: GifGroup, settings: GifSettings): Promise<RenderedGif> {
  const frames = await drawFrames(group, settings);
  const start = QUALITY_COLORS[settings.quality];
  const limit = settings.maxKb > 0 ? settings.maxKb * 1024 : Infinity;

  let blob = await encode(frames, group.width, group.height, settings.loop, start);
  if (blob.size <= limit || !settings.fit) return { blob, colors: start, fits: blob.size <= limit };

  let colors = start;
  for (const step of FIT_STEPS.filter((c) => c < start)) {
    colors = step;
    blob = await encode(frames, group.width, group.height, settings.loop, step);
    if (blob.size <= limit) return { blob, colors, fits: true };
  }
  return { blob, colors, fits: false };
}

/** Firma de todo lo que cambia el resultado: si coincide, el GIF ya generado sirve. */
export function renderSignature(group: GifGroup, settings: GifSettings) {
  return JSON.stringify([
    group.frames.map((f) => [f.id, frameDuration(f, settings)]),
    settings.loop,
    settings.quality,
    settings.fit ? settings.maxKb : 0,
  ]);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function zipGifs(files: { name: string; blob: Blob }[]) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const f of files) zip.file(`${f.name}.gif`, f.blob);
  return zip.generateAsync({ type: "blob" });
}

export function formatKb(bytes: number) {
  return `${Math.round(bytes / 1024).toLocaleString("es")} KB`;
}
