import { NextResponse, type NextRequest } from "next/server";
import { Basecamp } from "@/lib/integraciones/basecamp";
import { ReconectarError } from "@/lib/integraciones/reconectar";
import { anotarLlaveServidor } from "@/lib/integraciones/llave-servidor";
import { esAdminApp } from "@/lib/integraciones/store";
import { correrPaso, type SyncPaso } from "@/lib/integraciones/basecamp-sync";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PASOS: SyncPaso[] = ["personas", "proyectos", "webhooks", "miembros", "tareas", "columnas", "actividad"];

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
  // Traer los datos de Basecamp es cosa de admins (la conexión del estudio solo la ven ellos).
  if (!(await esAdminApp(db))) {
    return NextResponse.json({ error: "Solo un admin de la app sincroniza Basecamp", soloAdmins: true }, { status: 403 });
  }
  let conTurno = false;

  try {
    if (paso === "personas") {
      // Una sincronización a la vez para todo el estudio.
      const { data: turno, error } = await db.rpc("bc_tomar_sync");
      if (error) throw new Error(error.message);
      if (!turno) {
        return NextResponse.json({ error: "Alguien ya está sincronizando Basecamp. Esperá un minuto.", ocupado: true }, { status: 409 });
      }
      conTurno = true;
      // La llave con la que el servidor abre el Drive para el link del cliente, al día (por si
      // cambió INTEGRACIONES_SECRET). Si falla, la sincronización sigue igual.
      await anotarLlaveServidor(db, "drive").catch(() => false);
    }
    const bc = await Basecamp.desde(db);
    if (!bc) return NextResponse.json({ error: "Basecamp no está conectado" }, { status: 400 });
    return NextResponse.json(await correrPaso(bc, db, paso, { completa: body.completa === true }));
  } catch (e) {
    const message = (e as Error).message;
    // Si falló antes de empezar (ej: la conexión guardada no se puede abrir), el motivo queda a la
    // vista en la página y se libera el turno, en vez de dejarlo tomado dos minutos.
    if (conTurno || paso !== "personas") {
      await db
        .from("bc_sync")
        .update({ ultimo_error: message, corriendo_desde: null })
        .eq("id", "basecamp")
        .then(() => undefined, () => undefined);
    }
    return NextResponse.json({ error: message, reconectar: e instanceof ReconectarError }, { status: e instanceof ReconectarError ? 409 : 500 });
  }
}
