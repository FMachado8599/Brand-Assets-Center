import { NextResponse, type NextRequest } from "next/server";
import { hasBasecampEnv } from "@/lib/integraciones/basecamp";
import { AUTORIZAR_PATH, hashLlave, nuevaLlave } from "@/lib/integraciones/basecamp-invitacion";
import { hasSecret } from "@/lib/integraciones/crypto";
import { appOrigin, esAdminApp } from "@/lib/integraciones/store";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Un admin de la app genera el link para que un admin de Basecamp autorice la conexión del estudio
 * con su cuenta. Generar uno nuevo invalida el anterior.
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  if (!hasBasecampEnv() || !hasSecret()) {
    return NextResponse.json({ error: "Faltan BASECAMP_CLIENT_ID, BASECAMP_CLIENT_SECRET o INTEGRACIONES_SECRET en el servidor" }, { status: 503 });
  }
  const db = createSupabaseServer();
  if (!(await esAdminApp(db))) {
    return NextResponse.json({ error: "Solo un admin de la app puede generar el link" }, { status: 403 });
  }
  const llave = nuevaLlave();
  const { data, error } = await db.rpc("bc_crear_invitacion", { p_hash: hashLlave(llave) });
  if (error) {
    const sinMigracion = /bc_crear_invitacion|bc_invitaciones|schema cache|does not exist/i.test(error.message);
    return NextResponse.json(
      { error: sinMigracion ? "Falta correr supabase/migracion-basecamp-conexion.sql en Supabase" : error.message },
      { status: sinMigracion ? 503 : 500 }
    );
  }
  return NextResponse.json({ url: `${appOrigin(request.url)}${AUTORIZAR_PATH}?invitacion=${llave}`, vence: data });
}
