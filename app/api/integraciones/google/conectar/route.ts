import { NextResponse, type NextRequest } from "next/server";
import { hasSecret } from "@/lib/integraciones/crypto";
import { googleAuthorizeUrl, hasGoogleEnv } from "@/lib/integraciones/google";
import { empezarOAuth } from "@/lib/integraciones/oauth-state";
import { appOrigin } from "@/lib/integraciones/store";

export const dynamic = "force-dynamic";

/** Manda a Google a autorizar el Drive del estudio (solo las carpetas que cree la app). */
export function GET(request: NextRequest) {
  if (!hasGoogleEnv() || !hasSecret()) {
    return NextResponse.json(
      { error: "Faltan GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET o INTEGRACIONES_SECRET en el servidor" },
      { status: 503 }
    );
  }
  const origin = appOrigin(request.url);
  const hint = request.nextUrl.searchParams.get("cuenta") ?? undefined;
  return empezarOAuth(request, "google", (state) => googleAuthorizeUrl(origin, state, hint));
}
