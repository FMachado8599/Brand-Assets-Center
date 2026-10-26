import { NextResponse, type NextRequest } from "next/server";
import { studioSession } from "@/lib/access";
import { Influencity, InfluencityError, mensajeInfluencity } from "@/lib/influencity/api";
import { errorJson } from "@/lib/influencity/ruta";
import { leerCuotas } from "@/lib/influencity/sync";
import { hasSecret } from "@/lib/integraciones/crypto";
import { borrarConexion, guardarConexion, leerPublicas } from "@/lib/integraciones/store";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Cómo está la conexión con Influencity y la última sincronización (sin el token). */
export async function GET() {
  const db = createSupabaseServer();
  try {
    const [conexiones, sync] = await Promise.all([
      leerPublicas(db),
      db.from("inf_sync").select("ultimo, ultimo_error, resumen, cuotas, corriendo_desde").eq("id", "influencity").maybeSingle(),
    ]);
    if (sync.error) throw new Error(sync.error.message);
    const conexion = conexiones.find((c) => c.proveedor === "influencity") ?? null;
    return NextResponse.json({ listo: { secreto: hasSecret() }, conexion, sync: sync.data ?? null });
  } catch (e) {
    return errorJson(e);
  }
}

/**
 * Conectar: se prueba el token contra la API (si Influencity no lo acepta, no se guarda) y se
 * guarda cifrado. También se anota qué incluye el plan y lo que queda de las cuotas.
 */
export async function POST(request: NextRequest) {
  const { token } = (await request.json().catch(() => ({}))) as { token?: string };
  const limpio = token?.trim().replace(/^Bearer\s+/i, "") ?? "";
  if (limpio.length < 10) return NextResponse.json({ error: "Pegá el token de la API de Influencity" }, { status: 400 });
  if (!hasSecret()) return NextResponse.json({ error: "Falta INTEGRACIONES_SECRET en las variables del servidor" }, { status: 500 });

  const db = createSupabaseServer();
  try {
    const api = new Influencity(limpio);
    let tracking = true;
    try {
      await api.trackings(1, 1);
    } catch (e) {
      if (!(e instanceof InfluencityError) || e.status !== 403) throw e;
      tracking = false;
    }
    const cuotas = await leerCuotas(api);
    const session = await studioSession(db);
    await guardarConexion(db, {
      proveedor: "influencity",
      cuenta_nombre: "Influencity",
      conectada_por: session?.name ?? session?.email ?? null,
      accessToken: limpio,
      datos: { final: limpio.slice(-4), tracking, perfiles: cuotas.analisis !== null },
    });
    await db.from("inf_sync").upsert({ id: "influencity", cuotas });
    return NextResponse.json({ ok: true, tracking, cuotas });
  } catch (e) {
    if (e instanceof InfluencityError && e.status === 401) {
      return NextResponse.json({ error: mensajeInfluencity(e) }, { status: 400 });
    }
    return errorJson(e);
  }
}

/** Desconectar: se borra el token guardado (lo sincronizado queda). */
export async function DELETE() {
  try {
    await borrarConexion(createSupabaseServer(), "influencity");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
