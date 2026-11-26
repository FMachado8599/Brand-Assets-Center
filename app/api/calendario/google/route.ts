import { NextResponse, type NextRequest } from "next/server";
import { CalendarioEstudio } from "@/lib/integraciones/calendario";
import { pideReconectar } from "@/lib/integraciones/reconectar";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Las reuniones del Google Calendar del estudio y los feriados entre dos días (?desde=&hasta=, hasta
 * 3 meses). Sin Google conectado o sin el permiso de Calendar, contesta qué falta en vez de fallar.
 */
export async function GET(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const desde = request.nextUrl.searchParams.get("desde") ?? "";
  const hasta = request.nextUrl.searchParams.get("hasta") ?? "";
  if (!DIA.test(desde) || !DIA.test(hasta) || hasta < desde) return NextResponse.json({ error: "Faltan las fechas" }, { status: 400 });
  if (Date.parse(hasta) - Date.parse(desde) > 100 * 86_400_000) return NextResponse.json({ error: "Hasta 3 meses por vez" }, { status: 400 });

  try {
    const cal = await CalendarioEstudio.desde(createSupabaseServer());
    if (!cal) return NextResponse.json({ conectado: false, permiso: false, eventos: [], feriados: [] });
    if (!cal.permiso) return NextResponse.json({ conectado: true, permiso: false, cuenta: cal.cuenta, eventos: [], feriados: [] });
    const [eventos, feriados] = await Promise.all([cal.reuniones(desde, hasta), cal.feriados(desde, hasta)]);
    return NextResponse.json({ conectado: true, permiso: true, cuenta: cal.cuenta, calendario: { id: cal.id, nombre: cal.nombre }, eventos, feriados });
  } catch (e) {
    const message = (e as Error).message;
    return NextResponse.json({ error: message, reconectar: pideReconectar(message) }, { status: 502 });
  }
}
