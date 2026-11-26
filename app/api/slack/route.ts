import { NextResponse, type NextRequest } from "next/server";
import { hasSecret } from "@/lib/integraciones/crypto";
import { anotarLlaveServidor } from "@/lib/integraciones/llave-servidor";
import { pideReconectar } from "@/lib/integraciones/reconectar";
import { hasSlackEnv, Slack, type SlackDatos } from "@/lib/integraciones/slack";
import { appOrigin, esAdminApp, guardarDatos, leerPublicas } from "@/lib/integraciones/store";
import { avisosDelDia } from "@/lib/slack/envios";
import { vincularPersonas } from "@/lib/slack/personas";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sinMigracion = (m: string) => /slack_|integraciones_proveedor|schema cache|does not exist|42P01/i.test(m);

/**
 * Cómo está Slack: la conexión (sin token), el canal del estudio, los canales de cada marca y quién
 * está vinculado. Lo ve todo el estudio (para saber si puede avisar); la lista de personas, solo admins.
 */
export async function GET() {
  if (!hasSupabaseEnv) return faltaSupabase();
  const db = createSupabaseServer();
  try {
    const [conexiones, canales, vinculos, yo, admin] = await Promise.all([
      leerPublicas(db),
      db.from("slack_canales").select("brand_id, canal_id, canal_nombre, avisos, creado_por, updated_at"),
      db.from("slack_personas").select("persona_id, slack_id, slack_nombre"),
      db.rpc("board_yo"),
      esAdminApp(db),
    ]);
    if (canales.error) throw new Error(canales.error.message);
    if (vinculos.error) throw new Error(vinculos.error.message);
    const c = conexiones.find((x) => x.proveedor === "slack") ?? null;
    const datos = (c?.datos ?? {}) as SlackDatos;
    const equipoId = (yo.data as { equipo_id?: string } | null)?.equipo_id ?? null;
    const lista = (vinculos.data ?? []) as { persona_id: string; slack_id: string; slack_nombre: string | null }[];
    const mio = lista.find((v) => v.persona_id === equipoId) ?? null;

    // Los admins, además: anotar la llave del servidor (por si cambió INTEGRACIONES_SECRET) y la gente.
    if (admin && c) await anotarLlaveServidor(db, "slack");

    return NextResponse.json({
      listo: { slack: hasSlackEnv(), secreto: hasSecret(), cron: Boolean(process.env.CRON_SECRET) },
      conexion: c
        ? {
            team_id: datos.team_id ?? c.cuenta_id,
            team_nombre: datos.team_nombre ?? c.cuenta_nombre,
            dominio: datos.dominio ?? null,
            conectada_por: c.conectada_por,
            conectada: c.conectada,
            canal_estudio: datos.canal_estudio ?? null,
          }
        : null,
      yo: { equipo_id: equipoId, slack_id: mio?.slack_id ?? null, slack_nombre: mio?.slack_nombre ?? null },
      canales: canales.data ?? [],
      vinculos: admin ? lista : undefined,
    });
  } catch (e) {
    const message = (e as Error).message;
    const falta = sinMigracion(message);
    return NextResponse.json(
      { error: falta ? "Falta correr supabase/migracion-slack.sql en Supabase" : message, sinMigracion: falta },
      { status: falta ? 503 : 500 }
    );
  }
}

/**
 * Lo que hace un admin:
 *  { accion: "vincular" }                         → volver a cruzar la gente del Slack con el equipo
 *  { accion: "canal_estudio", canal_id, nombre }  → el canal donde sale el aviso del día (null: ninguno)
 *  { accion: "probar" }                           → correr ahora los avisos de hoy (no repite lo que ya salió)
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const db = createSupabaseServer();
  if (!(await esAdminApp(db))) return NextResponse.json({ error: "Solo un admin de la app" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { accion?: string; canal_id?: string | null; nombre?: string | null };
  try {
    const slack = await Slack.desde(db);
    if (!slack) return NextResponse.json({ error: "Slack no está conectado" }, { status: 409 });

    if (body.accion === "vincular") {
      return NextResponse.json(await vincularPersonas(db, slack));
    }

    if (body.accion === "canal_estudio") {
      const id = body.canal_id ?? null;
      if (id && !/^C[A-Z0-9]{2,30}$/.test(id)) return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
      if (id) await slack.unirse(id);
      const datos: SlackDatos = { ...slack.datos, canal_estudio: id ? { id, nombre: String(body.nombre ?? "").slice(0, 80) } : null };
      await guardarDatos(db, "slack", datos);
      return NextResponse.json({ ok: true });
    }

    if (body.accion === "probar") {
      await anotarLlaveServidor(db, "slack");
      return NextResponse.json(await avisosDelDia(appOrigin(request.url)));
    }

    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (e) {
    const message = (e as Error).message;
    return NextResponse.json({ error: message, reconectar: pideReconectar(message) }, { status: 500 });
  }
}
