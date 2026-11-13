import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { llaveValida } from "@/lib/integraciones/basecamp-webhook";
import { faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Lo que manda Basecamp cada vez que pasa algo en un proyecto (los webhooks los registra la
 * sincronización). Sin sesión: Basecamp no tiene una. Se valida la llave de la URL y la base hace el
 * resto (bc_recibir_evento: guarda el evento, actualiza la card y reparte las notificaciones).
 *
 * Basecamp reintenta hasta 10 veces lo que no conteste 2xx y después apaga el webhook (la próxima
 * sincronización lo vuelve a prender). Por eso un error de la base contesta 500 (que reintente) y un
 * aviso que no sirve, 200 (que no insista).
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const llave = request.nextUrl.searchParams.get("llave");
  if (!llaveValida(llave)) return NextResponse.json({ error: "Llave inválida" }, { status: 401 });

  const evento = await request.json().catch(() => null);
  if (!evento || typeof evento !== "object" || Array.isArray(evento)) {
    return NextResponse.json({ ok: true, resultado: "ignorado" });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("bc_recibir_evento", { p_llave: llave, p_evento: evento });
  if (error) {
    // La llave no coincide con el hash guardado (cambió INTEGRACIONES_SECRET): la próxima
    // sincronización guarda el nuevo y actualiza los webhooks.
    const status = /Llave de Basecamp/i.test(error.message) ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, resultado: data });
}
