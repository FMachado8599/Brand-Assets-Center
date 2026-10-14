import { NextResponse, type NextRequest } from "next/server";
import { basecampAuthorizeUrl, hasBasecampEnv } from "@/lib/integraciones/basecamp";
import { hasSecret } from "@/lib/integraciones/crypto";
import { empezarOAuth } from "@/lib/integraciones/oauth-state";
import { appOrigin } from "@/lib/integraciones/store";

export const dynamic = "force-dynamic";

/** Manda a 37signals a autorizar la cuenta de Basecamp del estudio. */
export function GET(request: NextRequest) {
  if (!hasBasecampEnv() || !hasSecret()) {
    return NextResponse.json(
      { error: "Faltan BASECAMP_CLIENT_ID, BASECAMP_CLIENT_SECRET o INTEGRACIONES_SECRET en el servidor" },
      { status: 503 }
    );
  }
  const origin = appOrigin(request.url);
  return empezarOAuth(request, "basecamp", (state) => basecampAuthorizeUrl(origin, state));
}
