import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";
import { hasBasecampEnv } from "@/lib/integraciones/basecamp";
import { hasSecret } from "@/lib/integraciones/crypto";
import { hasGoogleEnv } from "@/lib/integraciones/google";
import { borrarConexion, esAdminApp, leerPublicas, type Proveedor } from "@/lib/integraciones/store";

export const dynamic = "force-dynamic";

/** Cómo están las conexiones con Basecamp y con el Drive del estudio (sin tokens). */
export async function GET() {
  if (!hasSupabaseEnv) return faltaSupabase();
  const db = createSupabaseServer();
  try {
    const [conexiones, sync] = await Promise.all([
      leerPublicas(db),
      db.from("bc_sync").select("ultimo, ultimo_error, resumen, corriendo_desde, tareas_hasta").eq("id", "basecamp").maybeSingle(),
    ]);
    const basecamp = conexiones.find((c) => c.proveedor === "basecamp") ?? null;
    const google = conexiones.find((c) => c.proveedor === "google") ?? null;
    return NextResponse.json({
      listo: { secreto: hasSecret(), basecamp: hasBasecampEnv(), google: hasGoogleEnv() },
      basecamp,
      google: google
        ? {
            ...google,
            datos: {
              raiz_url: google.datos?.raiz_url ?? null,
              raiz_nombre: google.datos?.raiz_propia ? (google.datos?.raiz_nombre ?? null) : null,
              completo: google.datos?.completo === true,
              calendario: google.datos?.calendario === true,
              calendario_id: typeof google.datos?.calendario_id === "string" ? google.datos.calendario_id : null,
              calendario_nombre: typeof google.datos?.calendario_nombre === "string" ? google.datos.calendario_nombre : null,
            },
          }
        : null,
      sync: sync.data ?? null,
    });
  } catch (e) {
    const message = (e as Error).message;
    // Sin migracion-integraciones.sql la tabla no existe: la app lo explica en vez de romperse.
    const sinMigracion = /integraciones|bc_sync|schema cache|does not exist/i.test(message);
    return NextResponse.json(
      { error: sinMigracion ? "Falta correr supabase/migracion-integraciones.sql en Supabase" : message, sinMigracion },
      { status: sinMigracion ? 503 : 500 }
    );
  }
}

/** Desconectar Basecamp, Google o Slack: se borran los tokens guardados (lo sincronizado queda). */
export async function DELETE(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const proveedor = request.nextUrl.searchParams.get("proveedor");
  if (proveedor !== "basecamp" && proveedor !== "google" && proveedor !== "slack") {
    return NextResponse.json({ error: "Proveedor desconocido" }, { status: 400 });
  }
  try {
    const db = createSupabaseServer();
    if (!(await esAdminApp(db))) {
      const nombre = proveedor === "basecamp" ? "Basecamp" : proveedor === "slack" ? "Slack" : "el Drive";
      return NextResponse.json({ error: `Solo un admin de la app puede desconectar ${nombre}` }, { status: 403 });
    }
    await borrarConexion(db, proveedor as Proveedor);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
