import { NextResponse, type NextRequest } from "next/server";
import { basecampAuthorizeUrl, hasBasecampEnv } from "@/lib/integraciones/basecamp";
import { hasSecret } from "@/lib/integraciones/crypto";
import { empezarOAuth, volverCon } from "@/lib/integraciones/oauth-state";
import { appOrigin, esAdminApp } from "@/lib/integraciones/store";
import { createSupabaseServer, safeNext } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Manda a 37signals a autorizar la cuenta de Basecamp del estudio. Solo admins de la app. */
export async function GET(request: NextRequest) {
  if (!hasBasecampEnv() || !hasSecret()) {
    return NextResponse.json(
      { error: "Faltan BASECAMP_CLIENT_ID, BASECAMP_CLIENT_SECRET o INTEGRACIONES_SECRET en el servidor" },
      { status: 503 }
    );
  }
  if (!(await esAdminApp(createSupabaseServer()))) {
    return volverCon(request, "basecamp", safeNext(request.nextUrl.searchParams.get("volver")), "error", "Solo un admin de la app puede conectar Basecamp.");
  }
  const origin = appOrigin(request.url);
  return empezarOAuth(request, "basecamp", (state) => basecampAuthorizeUrl(origin, state));
}
