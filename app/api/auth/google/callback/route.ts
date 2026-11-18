import type { NextRequest } from "next/server";
import { studioSession } from "@/lib/access";
import { Drive, DRIVE_SCOPES, emailDeIdToken, expiraEn, googleExchangeCode } from "@/lib/integraciones/google";
import { terminarOAuth, volverCon } from "@/lib/integraciones/oauth-state";
import { anotarLlaveServidor } from "@/lib/integraciones/llave-servidor";
import { appOrigin, esAdminApp, guardarConexion, leerConexion } from "@/lib/integraciones/store";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Vuelta de Google: se guardan los tokens cifrados y se crea (o se recupera) la carpeta raíz de las
 * presentaciones en ese Drive.
 */
export async function GET(request: NextRequest) {
  const volver = terminarOAuth(request, "google");
  if (!volver) return volverCon(request, "google", "/presentaciones", "error", "El pedido venció o no coincide. Probá de nuevo.");

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return volverCon(request, "google", volver, "error", request.nextUrl.searchParams.get("error") ?? "Google no autorizó la conexión");

  try {
    const origin = appOrigin(request.url);
    const tokens = await googleExchangeCode(origin, code);
    const granted = tokens.scope?.split(" ") ?? [];
    if (!granted.includes(DRIVE_SCOPES[2])) {
      return volverCon(request, "google", volver, "error", "Hay que tildar el permiso de Google Drive para conectar");
    }
    const email = emailDeIdToken(tokens.id_token);
    const db = createSupabaseServer();
    if (!(await esAdminApp(db))) return volverCon(request, "google", volver, "error", "Solo un admin de la app puede conectar el Drive del estudio.");
    const session = await studioSession(db);

    // Si es la misma cuenta que ya estaba, se conserva la carpeta raíz (y todo lo que hay adentro).
    const anterior = await leerConexion(db, "google").catch(() => null);
    const datos = anterior && anterior.cuenta_id === email ? anterior.datos : {};

    await guardarConexion(db, {
      proveedor: "google",
      cuenta_id: email,
      cuenta_nombre: email,
      conectada_por: session?.email ?? null,
      accessToken: tokens.access_token,
      // Google solo manda el refresh token la primera vez (o con prompt=consent, que es lo que se pide).
      refreshToken: tokens.refresh_token ?? anterior?.refreshToken ?? null,
      expira: expiraEn(tokens.expires_in),
      datos,
    });

    const drive = await Drive.desde(db);
    await drive?.raiz();
    // Para que el link del cliente pueda mostrar el material sin que la conexión salga del servidor.
    await anotarLlaveServidor(db, "drive");
    return volverCon(request, "google", volver, "conectado");
  } catch (e) {
    return volverCon(request, "google", volver, "error", (e as Error).message);
  }
}
