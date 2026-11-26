import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/integraciones/store";
import { despacharColaSinFallar } from "@/lib/slack/envios";
import { faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Después de que el cliente comenta o aprueba en la presentación compartida: manda a Slack lo que
 * quedó en la cola (el aviso lo arma la base con un trigger; acá solo se despacha). Sin sesión, como
 * toda la página del cliente. No recibe nada: solo vacía la cola, así que no sirve para mandar otra cosa.
 */
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  if (!hasSupabaseEnv) return faltaSupabase();
  if (!/^[\w-]{32,200}$/.test(params.token)) return NextResponse.json({ ok: false }, { status: 400 });
  const r = await despacharColaSinFallar(appOrigin(request.url));
  return NextResponse.json({ ok: true, enviados: r.enviados });
}
