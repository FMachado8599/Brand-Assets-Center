import { NextResponse, type NextRequest } from "next/server";
import { Influencity, mensajeInfluencity } from "@/lib/influencity/api";
import { errorJson } from "@/lib/influencity/ruta";
import { anotarError, correrPaso, type SyncPaso } from "@/lib/influencity/sync";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PASOS: SyncPaso[] = ["trackings", "publicaciones", "perfiles", "cierre"];

/**
 * Un paso de la sincronización con Influencity (ver lib/influencity/sync.ts). La app llama en loop
 * con el `siguiente` que devuelve cada uno hasta que dice "listo". `completa` (solo en el primer
 * paso) vuelve a leer todo, también las campañas terminadas y los perfiles al día.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { paso?: string; completa?: boolean };
  const paso = (PASOS.includes(body.paso as SyncPaso) ? body.paso : "trackings") as SyncPaso;
  const db = createSupabaseServer();

  try {
    if (paso === "trackings") {
      // Una sincronización a la vez para todo el estudio.
      const { data: turno, error } = await db.rpc("inf_tomar_sync");
      if (error) throw new Error(error.message);
      if (!turno) {
        return NextResponse.json({ error: "Alguien ya está sincronizando Influencity. Esperá un minuto.", ocupado: true }, { status: 409 });
      }
    }
    const api = await Influencity.desde(db);
    if (!api) return NextResponse.json({ error: "Influencity no está conectado" }, { status: 400 });
    return NextResponse.json(await correrPaso(api, db, paso, { completa: body.completa === true }));
  } catch (e) {
    await anotarError(db, mensajeInfluencity(e)).catch(() => {});
    return errorJson(e);
  }
}
