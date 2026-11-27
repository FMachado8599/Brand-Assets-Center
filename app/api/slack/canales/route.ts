import { NextResponse, type NextRequest } from "next/server";
import { studioSession } from "@/lib/access";
import { nombreDeCanal, Slack } from "@/lib/integraciones/slack";
import { appOrigin, esAdminApp } from "@/lib/integraciones/store";
import { bienvenidaCanal } from "@/lib/slack/mensajes";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function admin() {
  const db = createSupabaseServer();
  if (!(await esAdminApp(db))) return { db, error: NextResponse.json({ error: "Solo un admin de la app" }, { status: 403 }) };
  const slack = await Slack.desde(db);
  if (!slack) return { db, error: NextResponse.json({ error: "Slack no está conectado" }, { status: 409 }) };
  return { db, slack };
}

/** Los canales públicos del Slack, para elegir el del estudio o vincular uno existente a una marca. */
export async function GET() {
  if (!hasSupabaseEnv) return faltaSupabase();
  const { slack, error } = await admin();
  if (error) return error;
  try {
    return NextResponse.json({ canales: await slack.canales() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * El canal de una marca:
 *  { brand_id, nombre }    → crea el canal (si ya hay uno con ese nombre, usa ese)
 *  { brand_id, canal_id }  → vincula uno que ya existe
 * En los dos casos el bot entra al canal e invita al equipo de la marca (designados, hub y directores).
 *  { brand_id, invitar: true } → vuelve a invitar al equipo (si cambió la gente de la marca)
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const { db, slack, error } = await admin();
  if (error) return error;
  const body = (await request.json().catch(() => ({}))) as { brand_id?: string; nombre?: string; canal_id?: string; invitar?: boolean };
  if (!body.brand_id || !UUID.test(body.brand_id)) return NextResponse.json({ error: "Falta la marca" }, { status: 400 });

  try {
    const { data: marca, error: e1 } = await db.from("brands").select("id, name").eq("id", body.brand_id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!marca) return NextResponse.json({ error: "No existe esa marca" }, { status: 404 });

    let canal: { id: string; nombre: string; nuevo: boolean };
    if (body.invitar) {
      const { data: actual } = await db.from("slack_canales").select("canal_id, canal_nombre").eq("brand_id", marca.id).maybeSingle();
      if (!actual) return NextResponse.json({ error: "Esa marca no tiene canal" }, { status: 404 });
      canal = { id: actual.canal_id, nombre: actual.canal_nombre, nuevo: false };
      await slack.unirse(canal.id);
    } else if (body.canal_id) {
      if (!/^C[A-Z0-9]{2,30}$/.test(body.canal_id)) return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
      await slack.unirse(body.canal_id);
      const info = await slack.api<{ channel: { id: string; name: string } }>("conversations.info", { channel: body.canal_id });
      canal = { id: info.channel.id, nombre: info.channel.name, nuevo: false };
    } else {
      const creado = await slack.crearCanal(nombreDeCanal(body.nombre?.trim() || marca.name));
      canal = { id: creado.id, nombre: creado.nombre, nuevo: !creado.existia };
    }

    // El equipo de la marca que está vinculado en Slack.
    const { data: gente, error: e2 } = await db.rpc("marca_gente", { p_brand: marca.id });
    if (e2) throw new Error(e2.message);
    const personas = (gente ?? []) as { persona_id: string; nombre: string; slack_id: string | null }[];
    const conSlack = personas.filter((p) => p.slack_id).map((p) => p.slack_id!);
    await slack.invitar(canal.id, conSlack);

    if (!body.invitar) {
      const session = await studioSession(db);
      const { error: e3 } = await db.from("slack_canales").upsert({
        brand_id: marca.id,
        canal_id: canal.id,
        canal_nombre: canal.nombre,
        creado_por: session?.email ?? null,
        updated_at: new Date().toISOString(),
      });
      if (e3) throw new Error(e3.message);
      if (canal.nuevo) await slack.postear(canal.id, bienvenidaCanal(marca.name, appOrigin(request.url), marca.id)).catch(() => null);
    }

    return NextResponse.json({
      canal,
      invitados: conSlack.length,
      sinSlack: personas.filter((p) => !p.slack_id).map((p) => p.nombre),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Prender o apagar los avisos del cliente en el canal de una marca: { brand_id, avisos }. */
export async function PATCH(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const db = createSupabaseServer();
  if (!(await esAdminApp(db))) return NextResponse.json({ error: "Solo un admin de la app" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { brand_id?: string; avisos?: boolean };
  if (!body.brand_id || !UUID.test(body.brand_id) || typeof body.avisos !== "boolean") {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }
  const { error } = await db.from("slack_canales").update({ avisos: body.avisos, updated_at: new Date().toISOString() }).eq("brand_id", body.brand_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Desvincular el canal de una marca (el canal queda en Slack, solo deja de usarse). */
export async function DELETE(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const db = createSupabaseServer();
  if (!(await esAdminApp(db))) return NextResponse.json({ error: "Solo un admin de la app" }, { status: 403 });
  const brand = request.nextUrl.searchParams.get("brand_id");
  if (!brand || !UUID.test(brand)) return NextResponse.json({ error: "Falta la marca" }, { status: 400 });
  const { error } = await db.from("slack_canales").delete().eq("brand_id", brand);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
