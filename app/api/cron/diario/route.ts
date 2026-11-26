import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/integraciones/store";
import { avisosDelDia } from "@/lib/slack/envios";
import { hasSupabaseEnv, faltaSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * La tarea de cada mañana (vercel.json → crons): los cumpleaños, quién está fuera de oficina y el
 * resumen de cada uno por Slack, y lo que haya quedado en la cola. Vercel la llama con
 * "Authorization: Bearer <CRON_SECRET>"; sin esa clave no corre. Repetirla el mismo día no duplica nada.
 */
export async function GET(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return NextResponse.json({ error: "Falta CRON_SECRET en el servidor" }, { status: 503 });
  const dada = Buffer.from(request.headers.get("authorization") ?? "");
  const esperada = Buffer.from(`Bearer ${secreto}`);
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const resultado = await avisosDelDia(appOrigin(request.url));
  return NextResponse.json(resultado);
}
