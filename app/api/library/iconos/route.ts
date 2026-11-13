import { NextResponse } from "next/server";
import { errorResponse, MagnificError } from "@/lib/magnific/api";
import { isShape } from "@/lib/library/iconos";
import { MAX_TERM, searchIcons } from "@/lib/library/iconos.server";

// Sin force-dynamic: en Next 14 apaga la caché de los fetch (la que evita repetirle búsquedas a Magnific).
// La ruta igual corre en cada pedido porque lee la URL.

/**
 * Busca íconos en Magnific (sin `q`, los que Magnific muestra primero):
 *   /api/library/iconos?q=<búsqueda>&forma=outline|fill|lineal-color|hand-drawn&pagina=<n>
 */
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const term = (params.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TERM);
    const shape = params.get("forma") ?? "";
    const page = Math.min(500, Math.max(1, Math.floor(Number(params.get("pagina")) || 1)));
    if (!isShape(shape)) throw new MagnificError("Estilo inválido", 400);
    return NextResponse.json(await searchIcons({ term, page, shape }));
  } catch (e) {
    return errorResponse(e);
  }
}
