import { MagnificError, magnificGet } from "@/lib/magnific/api";
import type { Icon, IconFormat, IconPage, PngSize, Shape } from "./iconos";

/**
 * La API de íconos de Magnific: buscar (GET /v1/icons) y pedir el archivo de uno (GET /v1/icons/{id}/download).
 * Buscar no gasta descargas: las miniaturas son públicas. Cada descarga sí cuenta en el plan, así que solo se
 * pide cuando alguien copia o baja un ícono.
 */

export const PER_PAGE = 60;
export const MAX_TERM = 80;

export async function searchIcons({ term, page, shape }: { term: string; page: number; shape: Shape }): Promise<IconPage> {
  const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
  if (term) params.set("term", term);
  if (shape) params.set("filters[shape]", shape);
  // La misma búsqueda se guarda una hora: no hace falta volver a pedírsela a Magnific.
  const body = await magnificGet("/icons", params, 3600);

  const items = (Array.isArray(body?.data) ? body.data : []).map(toIcon).filter((i: Icon | null): i is Icon => !!i);
  const p = body?.meta?.pagination ?? {};
  const current = Number(p.current_page) || page;
  const last = Number(p.last_page) || current;
  return { items, total: Number(p.total) || items.length, next: current < last && items.length > 0 ? current + 1 : null };
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function toIcon(raw: any): Icon | null {
  const id = Number(raw?.id);
  const thumbs: { url?: unknown; width?: unknown }[] = Array.isArray(raw?.thumbnails) ? raw.thumbnails : [];
  // La miniatura más chica que llegue a 128 px (se ven a 64, y en pantallas retina hace falta el doble).
  const sorted = thumbs.filter((t) => typeof t.url === "string").sort((a, b) => Number(a.width) - Number(b.width));
  const thumb = (sorted.find((t) => Number(t.width) >= 128) ?? sorted[sorted.length - 1])?.url;
  if (!Number.isFinite(id) || typeof thumb !== "string") return null;
  return {
    id,
    name: text(raw.name) ?? text(raw.slug) ?? `Ícono ${id}`,
    thumb,
    style: text(raw.style?.name),
    family: text(raw.family?.name),
    author: text(raw.author?.name),
  };
}

/** El link (que vence en minutos) al archivo del ícono, y el nombre con que Magnific lo bautiza. */
export async function iconFile(id: number, format: IconFormat, size: PngSize): Promise<{ url: string; filename: string | null }> {
  const params = new URLSearchParams({ format });
  if (format === "png") params.set("png_size", String(size));
  const body = await magnificGet(`/icons/${id}/download`, params);
  const url = [body?.data?.url, body?.url].find((u): u is string => typeof u === "string" && u.startsWith("https://"));
  if (!url) throw new MagnificError("Magnific no devolvió el archivo del ícono");
  return { url, filename: text(body?.data?.filename) };
}
