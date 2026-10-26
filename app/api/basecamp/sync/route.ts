import { NextResponse, type NextRequest } from "next/server";
import { Basecamp } from "@/lib/integraciones/basecamp";
import { correrPaso, type SyncPaso } from "@/lib/integraciones/basecamp-sync";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PASOS: SyncPaso[] = ["personas", "proyectos", "miembros", "tareas", "columnas", "actividad"];

/**
 * Un paso de la sincronización con Basecamp (ver lib/integraciones/basecamp-sync.ts). La app llama
 * en loop con el `siguiente` que devuelve cada uno hasta que dice "listo". `completa` (solo en el
 * primer paso) trae todas las tareas en vez de lo que cambió.
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const body = (await request.json().catch(() => ({}))) as { paso?: string; completa?: boolean };
  const paso = (PASOS.includes(body.paso as SyncPaso) ? body.paso : "personas") as SyncPaso;
  const db = createSupabaseServer();

  try {
    if (paso === "personas") {
      // Una sincronización a la vez para todo el estudio.
      const { data: turno, error } = await db.rpc("bc_tomar_sync");
      if (error) throw new Error(error.message);
      if (!turno) {
        return NextResponse.json({ error: "Alguien ya está sincronizando Basecamp. Esperá un minuto.", ocupado: true }, { status: 409 });
      }
    }
    const bc = await Basecamp.desde(db);
    if (!bc) return NextResponse.json({ error: "Basecamp no está conectado" }, { status: 400 });
    return NextResponse.json(await correrPaso(bc, db, paso, { completa: body.completa === true }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
