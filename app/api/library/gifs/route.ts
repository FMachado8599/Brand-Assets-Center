import { NextResponse } from "next/server";
import { errorResponse, GiphyError, MAX_OFFSET, MAX_QUERY, searchGiphy } from "@/lib/library/giphy.server";
import type { GifKind } from "@/lib/library/gifs";

// Sin force-dynamic: en Next 14 apaga la caché de los fetch, y la caché es lo que cuida los pedidos a GIPHY.
// La ruta igual corre en cada pedido porque lee la URL.

const KINDS = new Set<GifKind>(["gifs", "stickers"]);

/**
 * Busca en GIPHY (o trae las tendencias, sin `q`):
 *   /api/library/gifs?tipo=gifs|stickers&q=<búsqueda>&offset=<desde>
 */
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const kind = (params.get("tipo") ?? "gifs") as GifKind;
    const query = (params.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
    const offset = Math.min(MAX_OFFSET, Math.max(0, Math.floor(Number(params.get("offset")) || 0)));
    if (!KINDS.has(kind)) throw new GiphyError("Tipo inválido", 400);
    return NextResponse.json(await searchGiphy({ kind, query, offset }));
  } catch (e) {
    return errorResponse(e);
  }
}
