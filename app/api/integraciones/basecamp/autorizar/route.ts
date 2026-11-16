import { NextResponse, type NextRequest } from "next/server";
import { basecampAuthorizeUrl, hasBasecampEnv } from "@/lib/integraciones/basecamp";
import { PANTALLA_AUTORIZADO } from "@/lib/integraciones/basecamp-invitacion";
import { hasSecret } from "@/lib/integraciones/crypto";
import { empezarOAuth } from "@/lib/integraciones/oauth-state";
import { appOrigin } from "@/lib/integraciones/store";
import { createSupabaseAnon, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * El link que un admin de la app le manda a un admin de Basecamp. Pública: quien lo abre no tiene por
 * qué tener cuenta en la app. Si el link sirve, lo manda a autorizar a Basecamp; la vuelta
 * (/api/auth/callback/basecamp) guarda la conexión para todo el estudio.
 */
export async function GET(request: NextRequest) {
  const pantalla = (motivo: string) => {
    const url = new URL(PANTALLA_AUTORIZADO, request.url);
    url.searchParams.set("basecamp", "error");
    url.searchParams.set("motivo", motivo);
    return NextResponse.redirect(url);
  };
  if (!hasSupabaseEnv || !hasBasecampEnv() || !hasSecret()) return pantalla("La app todavía no está configurada para conectar Basecamp.");
  const llave = request.nextUrl.searchParams.get("invitacion");
  if (!llave) return pantalla("El link está incompleto: copialo entero.");

  const { data, error } = await createSupabaseAnon().rpc("bc_invitacion_valida", { p_llave: llave });
  if (error || data !== true) return pantalla("Ese link venció o ya se usó. Pedile al admin de la app que genere uno nuevo.");

  const origin = appOrigin(request.url);
  return empezarOAuth(request, "basecamp", (state) => basecampAuthorizeUrl(origin, state), { volver: PANTALLA_AUTORIZADO, invitacion: llave });
}
