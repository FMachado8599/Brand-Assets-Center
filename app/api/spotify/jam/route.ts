import { NextResponse, type NextRequest } from "next/server";
import { estadoJam, guardarLink, terminarJam } from "@/lib/spotify/jam";
import { respuestaDeError } from "@/lib/spotify/respuesta";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Qué suena en el Jam, lo que viene, el DJ y el link para unirse. */
export async function GET() {
  if (!hasSupabaseEnv) return faltaSupabase();
  try {
    return NextResponse.json(await estadoJam(createSupabaseServer()), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return respuestaDeError(e, "No se pudo leer el Jam");
  }
}

// Los links que da Spotify al invitar a un Jam.
const LINK = /^https:\/\/(open\.spotify\.com|spotify\.link|spotify\.app\.link)\/\S+$/;

/** El DJ pega (o saca, con "") el link del Jam. */
export async function PATCH(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const { link } = ((await request.json().catch(() => ({}))) ?? {}) as { link?: unknown };
  const limpio = typeof link === "string" ? link.trim() : "";
  if (limpio && (!LINK.test(limpio) || limpio.length > 300)) {
    return NextResponse.json({ error: "Ese no parece un link de Spotify (Jam → Invitar → Copiar link)" }, { status: 400 });
  }
  try {
    await guardarLink(createSupabaseServer(), limpio || null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e, "No se pudo guardar el link");
  }
}

/** El DJ termina el Jam en la app (su Spotify sigue igual: el permiso se revoca en spotify.com/account/apps). */
export async function DELETE() {
  if (!hasSupabaseEnv) return faltaSupabase();
  try {
    await terminarJam(createSupabaseServer());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e, "No se pudo terminar el Jam");
  }
}
