import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/integraciones/store";
import { despacharColaSinFallar } from "@/lib/slack/envios";
import { faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Manda lo que espera en la cola de Slack. La llama la app después de algo que puede generar un aviso
 * (pasar una tarea, comentar con @). Con sesión del estudio (el middleware la exige).
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  return NextResponse.json(await despacharColaSinFallar(appOrigin(request.url)));
}
