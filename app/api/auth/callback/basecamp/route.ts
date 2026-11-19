import type { NextRequest } from "next/server";
import { studioSession } from "@/lib/access";
import { basecampEsAdmin, basecampExchangeCode, basecampIdentity, expiraDesde, type BasecampDatos } from "@/lib/integraciones/basecamp";
import { PANTALLA_AUTORIZADO } from "@/lib/integraciones/basecamp-invitacion";
import { encrypt } from "@/lib/integraciones/crypto";
import { leerOAuth, volverCon } from "@/lib/integraciones/oauth-state";
import { appOrigin, esAdminApp, guardarConexion, leerPublicas } from "@/lib/integraciones/store";
import { createSupabaseAnon, createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** La pantalla que muestra el resultado (?basecamp=…) cuando no se sabe de dónde se vino. */
const PANTALLA = "/board/basecamp";

/**
 * Vuelta de 37signals: se canjea el código, se elige la cuenta de Basecamp (bc3) y se guarda la
 * conexión del estudio, con los tokens cifrados. Dos formas de llegar:
 *  · un admin de la app tocó "Conectar" y autorizó con su propia cuenta de Basecamp (con sesión);
 *  · alguien abrió el link que generó un admin (ej: un admin de Basecamp que no usa la app): sin
 *    sesión, la base valida el link y guarda la conexión (bc_conectar_con_invitacion).
 * Pública en el middleware por el segundo caso; el primero igual exige ser admin.
 */
export async function GET(request: NextRequest) {
  const guardado = leerOAuth(request, "basecamp");
  if (!guardado) return volverCon(request, "basecamp", PANTALLA, "error", "El pedido venció o no coincide. Probá de nuevo.");
  const { volver, invitacion } = guardado;

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return volverCon(request, "basecamp", volver, "error", request.nextUrl.searchParams.get("error") ?? "Basecamp no autorizó la conexión");

  try {
    const db = invitacion ? null : createSupabaseServer();
    if (db && !(await esAdminApp(db))) {
      return volverCon(request, "basecamp", volver, "error", "Solo un admin de la app puede conectar Basecamp.");
    }

    const origin = appOrigin(request.url);
    const tokens = await basecampExchangeCode(origin, code);
    const identity = await basecampIdentity(tokens.access_token);
    // Si la persona tiene más de una cuenta de Basecamp, se queda con la del estudio: la de la
    // variable o, si no, la que ya estaba conectada (solo se puede saber con sesión de admin).
    const anterior = db ? (await leerPublicas(db).catch(() => [])).find((c) => c.proveedor === "basecamp")?.cuenta_id : undefined;
    const preferida = process.env.BASECAMP_ACCOUNT_ID || anterior;
    const cuentas = identity.accounts.filter((a) => a.product === "bc3");
    const cuenta = cuentas.find((a) => String(a.id) === preferida) ?? cuentas[0];
    if (!cuenta) return volverCon(request, "basecamp", volver, "error", "Esa cuenta de Basecamp no tiene ninguna cuenta Basecamp 3/4 asociada");

    const adminBasecamp = await basecampEsAdmin(tokens.access_token, cuenta.id);
    const datos: BasecampDatos = {
      persona_id: identity.identity.id,
      persona: `${identity.identity.first_name} ${identity.identity.last_name}`.trim(),
      email: identity.identity.email_address,
      admin_basecamp: adminBasecamp,
      por_link: Boolean(invitacion),
    };
    const expira = expiraDesde(tokens.expires_in);

    if (invitacion) {
      const { error } = await createSupabaseAnon().rpc("bc_conectar_con_invitacion", {
        p_llave: invitacion,
        p_conexion: {
          cuenta_id: String(cuenta.id),
          cuenta_nombre: cuenta.name,
          access_token: encrypt(tokens.access_token),
          refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
          expira: expira.toISOString(),
          datos,
        },
      });
      if (error) throw new Error(error.message);
    } else {
      const session = await studioSession(db!);
      await guardarConexion(db!, {
        proveedor: "basecamp",
        cuenta_id: String(cuenta.id),
        cuenta_nombre: cuenta.name,
        conectada_por: session?.email ?? datos.persona ?? null,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expira,
        datos,
      });
      // El error de la conexión anterior ("volvé a conectar…") ya no corre.
      await db!.from("bc_sync").update({ ultimo_error: null }).eq("id", "basecamp").then(() => undefined, () => undefined);
    }

    // Quien autorizó con el link termina en una pantalla pública: se le dice quién quedó y si es admin.
    if (volver.startsWith(PANTALLA_AUTORIZADO)) {
      const fin = new URL(volver, request.url);
      if (datos.persona) fin.searchParams.set("persona", datos.persona);
      if (adminBasecamp === false) fin.searchParams.set("admin", "no");
      return volverCon(request, "basecamp", fin.pathname + fin.search, "conectado");
    }
    return volverCon(request, "basecamp", volver, "conectado");
  } catch (e) {
    return volverCon(request, "basecamp", volver, "error", (e as Error).message);
  }
}
