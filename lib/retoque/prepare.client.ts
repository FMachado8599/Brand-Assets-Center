import { MAX_BYTES, MAX_PIXELS, type InputExt } from "./storage";

export type Prepared = {
  /** Lo que se sube: el archivo tal cual o, si Magnific no lo aceptaría, una copia en JPG. */
  blob: Blob;
  ext: InputExt;
  type: "image/jpeg" | "image/png";
  /** El tamaño de la imagen original (ya girada según su EXIF). */
  width: number;
  height: number;
  /** Si hubo que adaptarla, qué se hizo (se muestra en la tarjeta). */
  note?: string;
};

/**
 * Deja la imagen como la acepta Magnific: JPG o PNG, hasta 20 MB y 25 MP. Lo que ya cumple se sube tal
 * cual; lo demás (WEBP, GIF, AVIF, una foto enorme) se redibuja en un canvas y sale en JPG. El fondo de la
 * copia no importa: es justo lo que se va a sacar.
 */
export async function prepareImage(file: File): Promise<Prepared> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("El navegador no puede abrir esta imagen (¿es HEIC? Pasala a JPG en el Conversor)");
  }

  try {
    const { width, height } = bitmap;
    const native = file.type === "image/jpeg" || file.type === "image/png";
    if (native && file.size <= MAX_BYTES && width * height <= MAX_PIXELS) {
      const png = file.type === "image/png";
      return { blob: file, ext: png ? "png" : "jpg", type: png ? "image/png" : "image/jpeg", width, height };
    }

    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (width * height)));
    const w = Math.max(1, Math.floor(width * scale));
    const h = Math.max(1, Math.floor(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El navegador no pudo preparar la imagen");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);

    let blob: Blob | null = null;
    for (const quality of [0.95, 0.88, 0.8]) {
      blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
      if (blob && blob.size <= MAX_BYTES) break;
    }
    if (!blob || blob.size > MAX_BYTES) throw new Error("La imagen es demasiado pesada, aun en JPG");

    const note = scale < 1 ? `Se achicó a ${w} × ${h} (Magnific acepta hasta 25 MP)` : native ? "Se pasó a JPG para que pese menos de 20 MB" : "Se pasó a JPG para Magnific";
    return { blob, ext: "jpg", type: "image/jpeg", width, height, note };
  } finally {
    bitmap.close();
  }
}

/** "foto.final.jpg" → "foto.final (sin fondo).png" */
export function outputName(name: string) {
  return `${name.replace(/\.[a-z0-9]{1,5}$/i, "") || "imagen"} (sin fondo).png`;
}

/** Para el portapapeles hace falta un PNG: si Magnific devolviera otro tipo, se convierte. */
export async function asPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!png) throw new Error("No se pudo preparar la imagen");
  return png;
}
