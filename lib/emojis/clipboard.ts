import { imageUrl } from "./types";

/**
 * Copiar y descargar emojis. Los originales son PNG de 1000 px (~1,8 MB); el
 * tamaño elegido en ajustes se genera en el navegador con un canvas.
 */

export const SIZES = [128, 256, 512, 1000] as const;
export type EmojiSize = (typeof SIZES)[number];

const originals = new Map<string, Promise<Blob>>();

/** El PNG original, cacheado: copiar dos veces el mismo emoji no lo baja de nuevo. */
function original(id: string): Promise<Blob> {
  let pending = originals.get(id);
  if (!pending) {
    pending = fetch(imageUrl(id, true)).then((res) => {
      if (!res.ok) throw new Error(`No se pudo bajar el emoji (${res.status})`);
      return res.blob();
    });
    pending.catch(() => originals.delete(id));
    originals.set(id, pending);
    if (originals.size > 30) originals.delete(originals.keys().next().value!);
  }
  return pending;
}

export async function emojiPng(id: string, size: EmojiSize): Promise<Blob> {
  const blob = await original(id);
  if (size >= 1000) return blob.type === "image/png" ? blob : new Blob([blob], { type: "image/png" });

  const bitmap = await createImageBitmap(blob, { resizeWidth: size, resizeHeight: size, resizeQuality: "high" });
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  // Con tamaño explícito: algunos navegadores ignoran resizeWidth y el bitmap llega en 1000 px.
  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo generar el PNG"))), "image/png")
  );
}

export function canCopyImages() {
  return typeof window !== "undefined" && "ClipboardItem" in window && typeof navigator.clipboard?.write === "function";
}

/**
 * Copia el PNG al portapapeles. La promesa del blob va directo al
 * ClipboardItem: Safari exige que se construya en el mismo click, sin esperar
 * la descarga antes.
 */
export async function copyEmojiImage(id: string, size: EmojiSize) {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": emojiPng(id, size) })]);
}

export async function copyEmojiText(char: string) {
  await navigator.clipboard.writeText(char);
}

export async function downloadEmoji(id: string, size: EmojiSize, name: string) {
  saveBlob(await emojiPng(id, size), `${name}.png`);
}

export async function downloadZip(
  items: { id: string; name: string }[],
  size: EmojiSize,
  onProgress?: (done: number) => void
) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    const { id, name } = items[i];
    const n = used.get(name) ?? 0;
    used.set(name, n + 1);
    zip.file(`${n ? `${name}-${n + 1}` : name}.png`, await emojiPng(id, size));
    onProgress?.(i + 1);
  }
  saveBlob(await zip.generateAsync({ type: "blob" }), `emojis-${items.length}.zip`);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
