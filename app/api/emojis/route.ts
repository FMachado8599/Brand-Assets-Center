import { NextResponse } from "next/server";
import { BY_ID, listGroup, paginate } from "@/lib/emojis/catalog.server";
import { PAGE_SIZE } from "@/lib/emojis/types";

/**
 * Emojis de a páginas.
 *
 *   /api/emojis?group=3&subgroup=12&cursor=0&limit=60   una categoría (o subcategoría)
 *   /api/emojis?ids=1f600,1f525                          emojis puntuales (favoritos)
 *
 * El catálogo solo cambia con cada deploy (y Vercel vacía la CDN al deployar),
 * así que las respuestas se cachean fuerte.
 */
const ID = /^[0-9a-f]{2,6}(?:-[0-9a-f]{2,6}){0,12}$/;
const CACHE = { "Cache-Control": "public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400" };

function int(value: string | null, fallback: number) {
  const n = value === null ? NaN : Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const ids = params.get("ids");
  if (ids !== null) {
    const list = ids
      .split(",")
      .slice(0, 120)
      .map((id) => id.trim().toLowerCase())
      .filter((id) => ID.test(id))
      .map((id) => BY_ID.get(id))
      .filter((e) => e !== undefined);
    return NextResponse.json({ emojis: list, nextCursor: null, total: list.length }, { headers: CACHE });
  }

  const group = int(params.get("group"), -1);
  if (group < 0) return NextResponse.json({ error: "Falta group o ids" }, { status: 400 });
  const subgroup = params.has("subgroup") ? int(params.get("subgroup"), -1) : null;
  const cursor = int(params.get("cursor"), 0);
  const limit = Math.min(120, Math.max(1, int(params.get("limit"), PAGE_SIZE)));

  const page = paginate(listGroup(group, subgroup === -1 ? null : subgroup), cursor, limit);
  return NextResponse.json(
    { emojis: page.items, nextCursor: page.nextCursor, total: page.total },
    { headers: CACHE }
  );
}
