import type { NextRequest } from "next/server";
import { studioSession } from "@/lib/access";
import { basecampExchangeCode, basecampIdentity, expiraDesde } from "@/lib/integraciones/basecamp";
import { terminarOAuth, volverCon } from "@/lib/integraciones/oauth-state";
import { appOrigin, guardarConexion, leerPublicas } from "@/lib/integraciones/store";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Vuelta de 37signals: se canjea el código, se elige la cuenta de Basecamp (bc3) y se guardan los
 * tokens cifrados. La ruta es la misma que ya está registrada para el panel de STATUS.
 */
export async function GET(request: NextRequest) {
  const volver = terminarOAuth(request, "basecamp");
  if (!volver) return volverCon(request, "basecamp", "/clientes", "error", "El pedido venció o no coincide. Probá de nuevo.");

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return volverCon(request, "basecamp", volver, "error", request.nextUrl.searchParams.get("error") ?? "Basecamp no autorizó la conexión");

  try {
    const origin = appOrigin(request.url);
    const tokens = await basecampExchangeCode(origin, code);
    const identity = await basecampIdentity(tokens.access_token);
    const db = createSupabaseServer();
    // Si alguien entra con una persona que tiene más de una cuenta de Basecamp, se queda con la del
    // estudio: la de la variable o, si no, la que ya estaba conectada.
    const anterior = (await leerPublicas(db).catch(() => [])).find((c) => c.proveedor === "basecamp")?.cuenta_id;
    const preferida = process.env.BASECAMP_ACCOUNT_ID || anterior;
    const cuentas = identity.accounts.filter((a) => a.product === "bc3");
    const cuenta = cuentas.find((a) => String(a.id) === preferida) ?? cuentas[0];
    if (!cuenta) return volverCon(request, "basecamp", volver, "error", "Esa cuenta de Basecamp no tiene ninguna cuenta Basecamp 3/4 asociada");

    const session = await studioSession(db);
    await guardarConexion(db, {
      proveedor: "basecamp",
      cuenta_id: String(cuenta.id),
      cuenta_nombre: cuenta.name,
      conectada_por: session?.email ?? `${identity.identity.first_name} ${identity.identity.last_name}`.trim(),
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expira: expiraDesde(tokens.expires_in),
      datos: {
        persona_id: identity.identity.id,
        persona: `${identity.identity.first_name} ${identity.identity.last_name}`.trim(),
        email: identity.identity.email_address,
      },
    });
    return volverCon(request, "basecamp", volver, "conectado");
  } catch (e) {
    return volverCon(request, "basecamp", volver, "error", (e as Error).message);
  }
}
