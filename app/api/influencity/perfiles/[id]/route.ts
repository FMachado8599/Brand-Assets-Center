import { NextResponse, type NextRequest } from "next/server";
import { conInfluencity, ID_INFLUENCITY } from "@/lib/influencity/ruta";
import { guardarPerfil, leerCuotas } from "@/lib/influencity/sync";

export const dynamic = "force-dynamic";

/**
 * Un perfil: volver a leer su detalle, pedir el análisis de audiencia (la primera vez) o
 * actualizarlo (las siguientes). Las dos últimas gastan una cuota del período, por eso al final se
 * vuelven a leer las cuotas.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!ID_INFLUENCITY.test(id)) return NextResponse.json({ error: "Perfil desconocido" }, { status: 400 });
  const { accion } = (await request.json().catch(() => ({}))) as { accion?: "leer" | "analizar" | "refrescar" };

  return conInfluencity(async (api, db) => {
    if (accion === "analizar") await api.analizar(id);
    else if (accion === "refrescar") await api.refrescarPerfil(id);
    else if (accion !== "leer") throw new Error("Acción desconocida");
    await guardarPerfil(db, await api.perfil(id));
    if (accion !== "leer") {
      await db.from("inf_sync").upsert({ id: "influencity", cuotas: await leerCuotas(api) });
    }
    return { ok: true };
  });
}
