import { NextResponse } from "next/server";
import { studioSession } from "@/lib/access";
import { DownloadError } from "@/lib/downloads/http.server";
import { getInstagramInfo } from "@/lib/downloads/instagram.server";
import { NO_LINKS, parseLink } from "@/lib/downloads/links";
import { getPinterestInfo } from "@/lib/downloads/pinterest.server";
import { getYoutubeInfo } from "@/lib/downloads/youtube.server";
import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase-server";

// Instagram se lee con node:https (ver instagram.server.ts) y YouTube firma con node:crypto.
export const runtime = "nodejs";

/** /api/descargas/info?url=<posteo de Instagram, pin de Pinterest o video de YouTube> → título, miniatura y qué bajar. */
export async function GET(req: Request) {
  const link = parseLink(new URL(req.url).searchParams.get("url") ?? "");
  if (!link) return NextResponse.json({ error: NO_LINKS }, { status: 400 });

  try {
    let info;
    if (link.platform === "youtube") {
      // El servicio de la PC muestra quién baja cada video: va firmado junto con el permiso.
      const session = hasSupabaseEnv ? await studioSession(createSupabaseServer()) : null;
      info = await getYoutubeInfo(link, session && { name: session.name, email: session.email });
    } else {
      info = await (link.platform === "instagram" ? getInstagramInfo : getPinterestInfo)(link);
    }
    // Los links de Instagram vencen a los pocos días y el permiso de YouTube a las horas: alcanza con un rato.
    return NextResponse.json(info, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (err) {
    if (err instanceof DownloadError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[descargas/info]", err);
    return NextResponse.json({ error: "No pude leer ese link. Probá de nuevo en un rato." }, { status: 502 });
  }
}
