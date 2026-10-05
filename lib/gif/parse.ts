import type { Frame, GifGroup, GifSettings, InvalidFile } from "./types";

/**
 * Nombre de archivo esperado:  [prefijo_]ANCHOxALTO_ORDEN[-DURACIÓN].ext
 *
 *   300x250_1.jpg            frame 1, duración por defecto
 *   300x250_2-1.5s.jpg       frame 2, 1,5 segundos
 *   300x250-3-800ms.png      frame 3, 800 ms (guion también vale)
 *   verano_728x90_1.jpg      el prefijo separa campañas con la misma medida
 *
 * En Programática la guía decía "300x600_1.jpg" pero la regex solo aceptaba
 * "300x600-1.jpg": ahora valen los dos separadores.
 */
const NAME_RE = /^(.*?)(\d{2,4})x(\d{2,4})[_-](\d{1,3})(?:[_-](\d+(?:[.,]\d+)?)(ms|s))?\.(jpe?g|png|webp|gif)$/i;

export function parseName(filename: string) {
  const m = filename.match(NAME_RE);
  if (!m) return null;
  const [, rawPrefix, w, h, order, amount, unit] = m;
  const prefix = rawPrefix.replace(/[_\-\s.]+$/, "");
  const value = amount ? Number(amount.replace(",", ".")) : null;
  return {
    prefix,
    width: Number(w),
    height: Number(h),
    order: Number(order),
    durationMs: value === null ? null : Math.round(unit.toLowerCase() === "ms" ? value : value * 1000),
  };
}

const IMAGE = /^image\/(png|jpe?g|webp|gif)$/i;

export async function readFiles(files: File[]): Promise<{ frames: Frame[]; invalid: InvalidFile[] }> {
  const frames: Frame[] = [];
  const invalid: InvalidFile[] = [];

  await Promise.all(
    files.map(async (file) => {
      const id = crypto.randomUUID();
      if (!IMAGE.test(file.type)) {
        invalid.push({ id, filename: file.name, reason: "No es una imagen JPG, PNG, WebP o GIF" });
        return;
      }
      const url = URL.createObjectURL(file);
      const parsed = parseName(file.name);
      if (!parsed) {
        invalid.push({ id, filename: file.name, url, reason: "El nombre no sigue el formato 300x250_1.jpg" });
        return;
      }
      const natural = await imageSize(file).catch(() => undefined);
      const groupKey = `${parsed.prefix ? `${parsed.prefix}_` : ""}${parsed.width}x${parsed.height}`.toLowerCase();
      frames.push({
        id,
        file,
        filename: file.name,
        url,
        groupKey,
        prefix: parsed.prefix,
        width: parsed.width,
        height: parsed.height,
        order: parsed.order,
        durationMs: parsed.durationMs,
        durationSource: parsed.durationMs === null ? "default" : "filename",
        natural,
      });
    })
  );

  return { frames, invalid };
}

async function imageSize(file: File) {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

export function buildGroups(frames: Frame[]): GifGroup[] {
  const byKey = new Map<string, Frame[]>();
  for (const f of frames) byKey.set(f.groupKey, [...(byKey.get(f.groupKey) ?? []), f]);

  return [...byKey.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => a.order - b.order || a.filename.localeCompare(b.filename));
      const { width, height, prefix } = sorted[0];
      const warnings: string[] = [];

      const seen = new Set<number>();
      for (const f of sorted) {
        if (seen.has(f.order)) warnings.push(`El frame ${f.order} está repetido`);
        seen.add(f.order);
      }
      const max = Math.max(...sorted.map((f) => f.order));
      for (let i = 1; i <= max; i++) if (!seen.has(i)) warnings.push(`Falta el frame ${i}`);

      for (const f of sorted) {
        if (!f.natural) continue;
        const { width: nw, height: nh } = f.natural;
        if (nw === width && nh === height) continue;
        const sameRatio = Math.abs(nw / nh - width / height) < 0.01;
        if (!sameRatio) warnings.push(`${f.filename} mide ${nw}×${nh}: va a quedar con bordes blancos`);
      }
      if (sorted.length < 2) warnings.push("Tiene un solo frame: no va a animarse");

      return {
        key,
        name: `${prefix ? `${prefix}_` : ""}${width}x${height}`,
        width,
        height,
        frames: sorted,
        warnings,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
}

export function frameDuration(frame: Frame, settings: GifSettings) {
  const fallback = settings.unit === "ms" ? settings.defaultDuration : settings.defaultDuration * 1000;
  // Menos de 20 ms los navegadores lo muestran a 100 ms: se corta ahí.
  return Math.max(20, Math.round(frame.durationMs ?? fallback));
}

export function totalDuration(group: GifGroup, settings: GifSettings) {
  return group.frames.reduce((acc, f) => acc + frameDuration(f, settings), 0);
}

export function formatMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toLocaleString("es", { maximumFractionDigits: 2 })} s` : `${ms} ms`;
}
