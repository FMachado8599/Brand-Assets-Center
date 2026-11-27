import type { NextRequest } from "next/server";
import { studioSession } from "@/lib/access";
import { anotarLlaveServidor } from "@/lib/integraciones/llave-servidor";
import { terminarOAuth, volverCon } from "@/lib/integraciones/oauth-state";
import { Slack, slackExchangeCode, type SlackDatos } from "@/lib/integraciones/slack";
import { vincularPersonas } from "@/lib/slack/personas";
import { appOrigin, esAdminApp, guardarConexion, leerConexion } from "@/lib/integraciones/store";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Vuelta de Slack: se guarda el token del bot (cifrado), se anota la llave del servidor (para los
 * avisos que salen sin sesión) y se cruza la gente del Slack con el equipo por el mail.
 */
export async function GET(request: NextRequest) {
  const volver = terminarOAuth(request, "slack");
  if (!volver) return volverCon(request, "slack", "/board/slack", "error", "El pedido venció o no coincide. Probá de nuevo.");

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return volverCon(request, "slack", volver, "error", request.nextUrl.searchParams.get("error") ?? "Slack no autorizó la conexión");

  try {
    const db = createSupabaseServer();
    if (!(await esAdminApp(db))) return volverCon(request, "slack", volver, "error", "Solo un admin de la app puede conectar Slack.");
    const session = await studioSession(db);
    const tokens = await slackExchangeCode(appOrigin(request.url), code);
    const slack = new Slack(tokens.access_token);
    const team = await slack.team().catch(() => null);

    // Si es el mismo Slack que ya estaba, se conserva lo configurado (el canal del estudio).
    const anterior = await leerConexion(db, "slack").catch(() => null);
    const mismo = anterior?.cuenta_id === tokens.team?.id;
    const datos: SlackDatos = {
      ...(mismo ? (anterior?.datos as SlackDatos) : {}),
      team_id: tokens.team?.id,
      team_nombre: tokens.team?.name ?? team?.name,
      dominio: team?.domain ?? null,
      bot_id: tokens.bot_user_id ?? null,
    };

    await guardarConexion(db, {
      proveedor: "slack",
      cuenta_id: tokens.team?.id ?? null,
      cuenta_nombre: tokens.team?.name ?? null,
      conectada_por: session?.email ?? null,
      accessToken: tokens.access_token,
      datos,
    });
    await anotarLlaveServidor(db, "slack");
    await vincularPersonas(db, new Slack(tokens.access_token, datos)).catch(() => null);
    return volverCon(request, "slack", volver, "conectado");
  } catch (e) {
    return volverCon(request, "slack", volver, "error", (e as Error).message);
  }
}
