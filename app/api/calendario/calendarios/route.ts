import { NextResponse, type NextRequest } from "next/server";
import { CalendarioEstudio } from "@/lib/integraciones/calendario";
import { esAdminApp } from "@/lib/integraciones/store";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function abrir() {
  const db = createSupabaseServer();
  if (!(await esAdminApp(db))) return { error: NextResponse.json({ error: "Solo un admin de la app" }, { status: 403 }) };
  const cal = await CalendarioEstudio.desde(db);
  if (!cal?.permiso) return { error: NextResponse.json({ error: "Falta conectar Google con el permiso de Calendar" }, { status: 409 }) };
  return { cal };
}

/** Los calendarios de la cuenta del estudio en los que se puede escribir (solo admins). */
export async function GET() {
  if (!hasSupabaseEnv) return faltaSupabase();
  const { cal, error } = await abrir();
  if (error) return error;
  try {
    return NextResponse.json({ actual: cal.id, calendarios: await cal.calendarios() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

/** Elegir cuál usa el estudio: { id } (el principal de la cuenta es "primary"). */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const { cal, error } = await abrir();
  if (error) return error;
  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  try {
    const elegido = (await cal.calendarios()).find((c) => c.id === id);
    if (!elegido) return NextResponse.json({ error: "Ese calendario no es de la cuenta del estudio" }, { status: 400 });
    await cal.elegir(elegido.id, elegido.nombre);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
