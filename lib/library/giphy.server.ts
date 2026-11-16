import { NextResponse } from "next/server";
import type { Gif, GifFile, GifKind, GifPage } from "./gifs";

/**
 * Cliente mínimo de la API de GIPHY para el servidor. La key vive solo acá: el navegador le pide a
 * /api/library/gifs, nunca a GIPHY.
 *
 * Las keys de prueba de GIPHY tienen pocos pedidos por hora, así que cada búsqueda se guarda una hora en la
 * caché de datos de Next (y las tendencias, diez minutos): si dos personas buscan lo mismo, GIPHY recibe un
 * solo pedido.
 */

const BASE = "https://api.giphy.com/v1";
export const PAGE_SIZE = 30;
/** GIPHY no deja ir más allá de este offset ni buscar más de 50 letras. */
export const MAX_OFFSET = 4999;
export const MAX_QUERY = 50;

export class GiphyError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

const giphyKey = () => process.env.GIPHY_API_KEY?.trim() || null;
export const hasGiphyKey = () => Boolean(giphyKey());

export async function searchGiphy({ kind, query, offset }: { kind: GifKind; query: string; offset: number }): Promise<GifPage> {
  const key = giphyKey();
  if (!key) throw new GiphyError("Falta configurar GIPHY_API_KEY", 503);

  const params = new URLSearchParams({ api_key: key, limit: String(PAGE_SIZE), offset: String(offset), rating: "pg-13" });
  if (query) {
    params.set("q", query);
    params.set("lang", "es");
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/${kind}/${query ? "search" : "trending"}?${params}`, {
      next: { revalidate: query ? 3600 : 600 },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GiphyError("No se pudo hablar con GIPHY", 504);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new GiphyError(explain(res.status, body), res.status === 429 ? 429 : 502);

  const items = (Array.isArray(body?.data) ? body.data : []).map(toGif).filter((g: Gif | null): g is Gif => !!g);
  const total = Number(body?.pagination?.total_count) || 0;
  const seen = offset + (Number(body?.pagination?.count) || items.length);
  return { items, total, next: seen < total && seen <= MAX_OFFSET && items.length > 0 ? seen : null };
}

function explain(status: number, body: any) {
  if (status === 401 || status === 403) return "GIPHY no aceptó la API key: revisá GIPHY_API_KEY";
  if (status === 429) return "GIPHY está limitando los pedidos (la key de prueba deja pocos por hora): probá en un rato";
  const msg = body?.meta?.msg ?? body?.message;
  return typeof msg === "string" && msg ? `GIPHY: ${msg}` : `GIPHY falló (${status})`;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function file(url: unknown, width: unknown, height: unknown, bytes?: unknown): GifFile | null {
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  return { url, width: num(width) ?? 1, height: num(height) ?? 1, bytes: num(bytes) };
}

/** GIPHY manda veinte versiones de cada GIF (con los números como texto): nos quedamos con tres. */
function toGif(raw: any): Gif | null {
  const original = raw?.images?.original;
  const small = raw?.images?.fixed_width;
  const gif = file(original?.url, original?.width, original?.height, original?.size);
  const preview = file(small?.webp, small?.width, small?.height, small?.webp_size) ?? file(small?.url, small?.width, small?.height, small?.size) ?? gif;
  if (typeof raw?.id !== "string" || !gif || !preview) return null;
  const title = typeof raw.title === "string" ? raw.title.replace(/\s+/g, " ").trim() : "";
  return {
    id: raw.id,
    title,
    page: typeof raw.url === "string" ? raw.url : `https://giphy.com/gifs/${raw.id}`,
    user: [raw.user?.display_name, raw.username].find((v): v is string => typeof v === "string" && v.trim() !== "") ?? null,
    preview,
    files: {
      gif,
      mp4: file(original?.mp4, original?.width, original?.height, original?.mp4_size),
      webp: file(original?.webp, original?.width, original?.height, original?.webp_size),
    },
  };
}

export function errorResponse(e: unknown) {
  const status = e instanceof GiphyError ? e.status : 500;
  const message = e instanceof Error ? e.message : "Algo falló";
  return NextResponse.json({ error: message }, { status: status >= 400 && status < 600 ? status : 500 });
}
