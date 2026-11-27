import { NextResponse, type NextRequest } from "next/server";
import { Slack } from "@/lib/integraciones/slack";
import { appOrigin } from "@/lib/integraciones/store";
import { avisoEquipo } from "@/lib/slack/mensajes";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Avisarle algo al equipo de una marca desde la app (cualquiera del estudio):
 *  destino "canal"   → en el canal de la marca
 *  destino "privado" → un privado en grupo con la gente de la marca (Slack deja hasta 8 personas por
 *                      grupo; si son más, le llega un privado a cada uno)
 * El mensaje sale del bot, con el nombre de quien lo escribe.
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const body = (await request.json().catch(() => ({}))) as { brand_id?: string; texto?: string; destino?: string };
  const texto = body.texto?.trim() ?? "";
  if (!body.brand_id || !UUID.test(body.brand_id)) return NextResponse.json({ error: "Falta la marca" }, { status: 400 });
  if (!texto) return NextResponse.json({ error: "Escribí el mensaje" }, { status: 400 });
  if (texto.length > 2000) return NextResponse.json({ error: "El mensaje es demasiado largo (hasta 2000 caracteres)" }, { status: 400 });
  if (body.destino !== "canal" && body.destino !== "privado") return NextResponse.json({ error: "¿Al canal o por privado?" }, { status: 400 });

  const db = createSupabaseServer();
  try {
    const slack = await Slack.desde(db);
    if (!slack) return NextResponse.json({ error: "Slack no está conectado: lo conecta un admin en Ajustes → Slack" }, { status: 409 });

    const [{ data: marca }, { data: yo }, { data: gente, error: eGente }] = await Promise.all([
      db.from("brands").select("id, name").eq("id", body.brand_id).maybeSingle(),
      db.rpc("board_yo"),
      db.rpc("marca_gente", { p_brand: body.brand_id }),
    ]);
    if (!marca) return NextResponse.json({ error: "No existe esa marca" }, { status: 404 });
    if (eGente) throw new Error(eGente.message);
    const yoInfo = yo as { equipo_id: string | null; nombre: string | null; email: string } | null;
    const { data: miSlack } = yoInfo?.equipo_id
      ? await db.from("slack_personas").select("slack_id").eq("persona_id", yoInfo.equipo_id).maybeSingle()
      : { data: null };
    const autor = { nombre: yoInfo?.nombre || yoInfo?.email || "Alguien del estudio", slack_id: (miSlack?.slack_id as string | undefined) ?? null };
    const mensaje = avisoEquipo(autor, marca.name, texto, appOrigin(request.url), marca.id);

    if (body.destino === "canal") {
      const { data: canal } = await db.from("slack_canales").select("canal_id, canal_nombre").eq("brand_id", marca.id).maybeSingle();
      if (!canal) return NextResponse.json({ error: `${marca.name} no tiene canal de Slack todavía: lo crea un admin en Ajustes → Slack` }, { status: 409 });
      await slack.postear(canal.canal_id, mensaje);
      return NextResponse.json({ ok: true, canal: canal.canal_nombre });
    }

    const personas = ((gente ?? []) as { persona_id: string; nombre: string; slack_id: string | null }[]).filter((p) => p.persona_id !== yoInfo?.equipo_id);
    const destinos = [...new Set(personas.filter((p) => p.slack_id).map((p) => p.slack_id!))];
    if (!destinos.length) return NextResponse.json({ error: "Nadie del equipo de la marca está vinculado en Slack" }, { status: 409 });
    // En el grupo va también quien escribe (si está en Slack), para que vea las respuestas.
    const grupo = autor.slack_id ? [...destinos, autor.slack_id] : destinos;
    if (grupo.length <= 8) {
      await slack.postear(await slack.abrirPrivado(grupo), mensaje);
    } else {
      for (const d of destinos) await slack.privado(d, mensaje);
    }
    return NextResponse.json({
      ok: true,
      personas: destinos.length,
      enGrupo: grupo.length <= 8,
      sinSlack: personas.filter((p) => !p.slack_id).map((p) => p.nombre),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
