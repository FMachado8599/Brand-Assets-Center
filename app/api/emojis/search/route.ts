import { NextResponse } from "next/server";
import { BY_ID, paginate } from "@/lib/emojis/catalog.server";
import { normalize, rankIds, type SemanticHit } from "@/lib/emojis/search";
import { hasOpenAIKey, semanticHits } from "@/lib/emojis/semantic";
import { PAGE_SIZE } from "@/lib/emojis/types";

export const dynamic = "force-dynamic";

/**
 * Búsqueda de a páginas: /api/emojis/search?q=fuego&cursor=0&limit=60
 *
 * Mezcla la búsqueda por palabras con la búsqueda por significado (si hay
 * OPENAI_API_KEY). El orden completo de una consulta se guarda en memoria, así
 * "Cargar más" no vuelve a calcularlo ni a pagar el embedding.
 *
 * Con &modo=palabras solo busca por palabras: es lo que usa el autocompletado
 * de Redacción (":fue" → 🔥), que pide una búsqueda por letra y necesita
 * responder al toque.
 */

type Ranked = { ids: string[]; mode: "hybrid" | "keywords" };
const ranked = new Map<string, Ranked>();

function int(value: string | null, fallback: number) {
  const n = value === null ? NaN : Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

async function rank(q: string, keywordsOnly: boolean): Promise<Ranked> {
  const key = `${keywordsOnly ? "p" : "h"}:${normalize(q)}`;
  const hit = ranked.get(key);
  if (hit) return hit;

  let semantic: SemanticHit[] | null = null;
  // Un emoji pegado o una sola letra se resuelven por palabras.
  if (!keywordsOnly && hasOpenAIKey() && q.length >= 2 && !/\p{Extended_Pictographic}/u.test(q)) {
    try {
      semantic = await semanticHits(q);
    } catch (e) {
      console.error("[emojis] búsqueda por significado:", e);
    }
  }

  const result: Ranked = { ids: rankIds(q, semantic), mode: semantic ? "hybrid" : "keywords" };
  if (ranked.size > 300) ranked.delete(ranked.keys().next().value!);
  ranked.set(key, result);
  return result;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const cursor = int(params.get("cursor"), 0);
  const limit = Math.min(120, Math.max(1, int(params.get("limit"), PAGE_SIZE)));

  if (!q) return NextResponse.json({ emojis: [], nextCursor: null, total: 0, mode: "keywords" });

  const { ids, mode } = await rank(q, params.get("modo") === "palabras");
  const page = paginate(ids, cursor, limit);
  return NextResponse.json(
    { emojis: page.items.map((id) => BY_ID.get(id)!), nextCursor: page.nextCursor, total: page.total, mode },
    // La misma consulta da siempre lo mismo: que la CDN la guarde y no se pague el embedding dos veces.
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=604800, stale-while-revalidate=86400" } }
  );
}
