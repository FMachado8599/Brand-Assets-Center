import { NextResponse, type NextRequest } from "next/server";
import { sumarACola } from "@/lib/spotify/jam";
import { respuestaDeError } from "@/lib/spotify/respuesta";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const URI_TRACK = /^spotify:track:[A-Za-z0-9]{22}$/;

/** Suma una canción a la cola del Jam. Si ya está sonando o en la cola, no la suma (409). */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const body = ((await request.json().catch(() => ({}))) ?? {}) as { uri?: unknown; nombre?: unknown; artistas?: unknown };
  if (typeof body.uri !== "string" || !URI_TRACK.test(body.uri)) {
    return NextResponse.json({ error: "Esa no es una canción de Spotify" }, { status: 400 });
  }
  const texto = (v: unknown) => (typeof v === "string" ? v.slice(0, 300) : "");
  try {
    await sumarACola(createSupabaseServer(), { uri: body.uri, nombre: texto(body.nombre), artistas: texto(body.artistas) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e, "No se pudo sumar la canción a la cola");
  }
}
