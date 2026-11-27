import { NextResponse, type NextRequest } from "next/server";
import { hasSecret } from "@/lib/integraciones/crypto";
import { empezarOAuth } from "@/lib/integraciones/oauth-state";
import { hasSlackEnv, slackAuthorizeUrl } from "@/lib/integraciones/slack";
import { appOrigin, esAdminApp } from "@/lib/integraciones/store";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Manda a Slack a instalar el bot del estudio en el workspace. Solo admins de la app. */
export async function GET(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  if (!(await esAdminApp(createSupabaseServer()))) {
    return NextResponse.json({ error: "Solo un admin de la app puede conectar Slack" }, { status: 403 });
  }
  if (!hasSlackEnv() || !hasSecret()) {
    return NextResponse.json({ error: "Faltan SLACK_CLIENT_ID, SLACK_CLIENT_SECRET o INTEGRACIONES_SECRET en el servidor" }, { status: 503 });
  }
  const origin = appOrigin(request.url);
  return empezarOAuth(request, "slack", (state) => slackAuthorizeUrl(origin, state), { volver: request.nextUrl.searchParams.get("volver") ?? "/board/slack" });
}
