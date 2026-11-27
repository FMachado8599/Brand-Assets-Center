import { NextResponse, type NextRequest } from "next/server";
import { studioSession } from "@/lib/access";
import { CalendarioEstudio, type NuevoEvento } from "@/lib/integraciones/calendario";
import { esAdminApp } from "@/lib/integraciones/store";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Agendar una reunión en el Google Calendar del estudio (cualquiera del estudio). A los invitados les
 * llega la invitación por mail; con meet: true, lleva link de Google Meet.
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const b = (await request.json().catch(() => ({}))) as Partial<NuevoEvento>;
  const titulo = b.titulo?.trim() ?? "";
  if (!titulo || titulo.length > 200) return NextResponse.json({ error: "Poné un título (hasta 200 caracteres)" }, { status: 400 });
  if (!b.fecha || !DIA.test(b.fecha)) return NextResponse.json({ error: "Falta el día" }, { status: 400 });
  if (b.hora && !HORA.test(b.hora)) return NextResponse.json({ error: "La hora no es válida" }, { status: 400 });
  const duracion = Math.round(Number(b.duracion ?? 60));
  if (b.hora && !(duracion >= 5 && duracion <= 12 * 60)) return NextResponse.json({ error: "La duración va de 5 minutos a 12 horas" }, { status: 400 });
  const invitados = [...new Set((b.invitados ?? []).map((m) => String(m).trim().toLowerCase()).filter(Boolean))];
  if (invitados.length > 60) return NextResponse.json({ error: "Hasta 60 invitados" }, { status: 400 });
  const malo = invitados.find((m) => !MAIL.test(m));
  if (malo) return NextResponse.json({ error: `"${malo}" no parece un mail` }, { status: 400 });
  if (b.brandId && !UUID.test(b.brandId)) return NextResponse.json({ error: "Marca inválida" }, { status: 400 });

  try {
    const db = createSupabaseServer();
    const session = await studioSession(db);
    if (!session?.allowed) return NextResponse.json({ error: "Iniciá sesión con tu cuenta del estudio" }, { status: 401 });
    const cal = await CalendarioEstudio.desde(db);
    if (!cal) return NextResponse.json({ error: "Google no está conectado: lo conecta un admin (Presentaciones → Drive)" }, { status: 409 });
    if (!cal.permiso) return NextResponse.json({ error: "Falta el permiso de Google Calendar: un admin tiene que volver a conectar Google" }, { status: 409 });
    const evento = await cal.crear(
      {
        titulo,
        fecha: b.fecha,
        hora: b.hora || null,
        duracion,
        descripcion: b.descripcion?.slice(0, 4000) ?? null,
        ubicacion: b.ubicacion?.slice(0, 300) ?? null,
        invitados,
        meet: Boolean(b.meet) && Boolean(b.hora),
        brandId: b.brandId ?? null,
      },
      session.email
    );
    return NextResponse.json({ evento });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

/** Cancelar una reunión agendada desde la app (quien la agendó o un admin). Les avisa a los invitados. */
export async function DELETE(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[\w-]{5,1024}$/.test(id)) return NextResponse.json({ error: "Falta el evento" }, { status: 400 });
  try {
    const db = createSupabaseServer();
    const [session, admin, cal] = await Promise.all([studioSession(db), esAdminApp(db), CalendarioEstudio.desde(db)]);
    if (!session?.allowed) return NextResponse.json({ error: "Iniciá sesión con tu cuenta del estudio" }, { status: 401 });
    if (!cal?.permiso) return NextResponse.json({ error: "Google Calendar no está conectado" }, { status: 409 });
    const evento = await cal.evento(id);
    if (!admin && evento.creadoPor !== session.email) {
      return NextResponse.json({ error: "Solo quien la agendó desde la app (o un admin) la puede cancelar. Las demás se manejan en Google Calendar." }, { status: 403 });
    }
    await cal.borrar(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
