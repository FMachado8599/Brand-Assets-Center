import { NextResponse } from "next/server";
import { DownloadError } from "@/lib/downloads/http.server";
import { getInstagramInfo } from "@/lib/downloads/instagram.server";
import { NO_LINKS, parseLink } from "@/lib/downloads/links";
import { getPinterestInfo } from "@/lib/downloads/pinterest.server";

// Instagram se lee con node:https (ver instagram.server.ts).
export const runtime = "nodejs";

/** /api/descargas/info?url=<posteo de Instagram o pin de Pinterest> → título, miniatura y los archivos para bajar. */
export async function GET(req: Request) {
  const link = parseLink(new URL(req.url).searchParams.get("url") ?? "");
  if (!link) return NextResponse.json({ error: NO_LINKS }, { status: 400 });
  if (link.platform === "youtube") {
    return NextResponse.json({ error: "YouTube todavía no está disponible." }, { status: 501 });
  }

  try {
    const info = link.platform === "instagram" ? await getInstagramInfo(link) : await getPinterestInfo(link);
    // Los links de Instagram vencen a los pocos días: alcanza con guardar la respuesta un rato.
    return NextResponse.json(info, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (err) {
    if (err instanceof DownloadError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[descargas/info]", err);
    return NextResponse.json({ error: "No pude leer ese link. Probá de nuevo en un rato." }, { status: 502 });
  }
}
