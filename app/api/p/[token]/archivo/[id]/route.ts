import { NextResponse, type NextRequest } from "next/server";
import { decrypt } from "@/lib/integraciones/crypto";
import { Drive } from "@/lib/integraciones/google";
import { llaveServidor } from "@/lib/integraciones/llave-servidor";
import { servirArchivo, VALID_DRIVE_ID } from "@/lib/integraciones/servir";
import { leerEntrada } from "@/lib/plani/acceso.server";
import { createSupabaseAnon, createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Fila = { cuenta_id: string | null; access_token: string; refresh_token: string | null; expira: string | null; datos: Record<string, unknown> | null };

/**
 * Un archivo de una plani compartida, para la página del cliente. Primero la base confirma que el
 * link vale, que este navegador entró con un mail del cliente (o que es alguien del estudio) y que el
 * archivo es de esa plani; después el servidor pide la conexión del Drive con su propia llave. Las
 * credenciales nunca salen de acá.
 */
export async function GET(request: NextRequest, { params }: { params: { token: string; id: string } }) {
  if (!VALID_DRIVE_ID.test(params.id) || params.token.length < 32) {
    return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
  }
  try {
    const permitido = await createSupabaseServer().rpc("presentacion_ver_archivo", {
      p_token: params.token,
      p_sesion: leerEntrada(params.token),
      p_drive_id: params.id,
    });
    if (permitido.error) throw new Error(permitido.error.message);
    if (permitido.data !== true) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const db = createSupabaseAnon();
    const { data, error } = await db.rpc("drive_conexion_servidor", { p_llave: llaveServidor("drive") });
    if (error) throw new Error(error.message);
    const fila = data as Fila | null;
    if (!fila) {
      return NextResponse.json({ error: "El Drive todavía no está listo para el link del cliente: un admin tiene que volver a conectarlo" }, { status: 503 });
    }
    const drive = new Drive(db, {
      proveedor: "google",
      cuenta_id: fila.cuenta_id,
      cuenta_nombre: null,
      conectada_por: null,
      accessToken: decrypt(fila.access_token),
      refreshToken: fila.refresh_token ? decrypt(fila.refresh_token) : null,
      expira: fila.expira ? new Date(fila.expira) : null,
      datos: fila.datos ?? {},
      conectada: "",
    });
    const res = await servirArchivo(drive, params.id, request);
    // El link del cliente puede dejar de valer: que el navegador no lo guarde para siempre.
    if (res.headers.get("Cache-Control")?.includes("immutable")) res.headers.set("Cache-Control", "private, max-age=3600");
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
