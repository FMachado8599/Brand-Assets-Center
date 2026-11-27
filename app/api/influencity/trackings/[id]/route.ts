import { NextResponse, type NextRequest } from "next/server";
import { conInfluencity, ID_INFLUENCITY } from "@/lib/influencity/ruta";
import { guardarPublicaciones, sincronizarTrackings } from "@/lib/influencity/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Accion = "pausar" | "reanudar" | "refrescar" | "agregar" | "quitar" | "leer";

/**
 * Lo que se le puede hacer a una campaña desde la app: pausarla, reanudarla, pedirle a Influencity
 * que la refresque (1 vez por período), sumarle o sacarle perfiles, o volver a leer sus
 * publicaciones ya mismo (sin esperar a la próxima sincronización).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!ID_INFLUENCITY.test(id)) return NextResponse.json({ error: "Campaña desconocida" }, { status: 400 });
  const b = (await request.json().catch(() => ({}))) as { accion?: Accion; perfiles?: string[] };
  const perfiles = [...new Set((b.perfiles ?? []).filter((p) => typeof p === "string" && ID_INFLUENCITY.test(p)))];

  return conInfluencity(async (api, db) => {
    switch (b.accion) {
      case "pausar":
        await api.pausar([id]);
        await sincronizarTrackings(api, db);
        return { ok: true };
      case "reanudar":
        await api.reanudar([id]);
        await sincronizarTrackings(api, db);
        return { ok: true };
      case "refrescar":
        await api.refrescar(id);
        return { ok: true };
      case "agregar":
        if (!perfiles.length) throw new Error("Elegí al menos un perfil");
        await api.agregarPerfiles(id, perfiles);
        return { ok: true };
      case "quitar":
        if (!perfiles.length) throw new Error("Elegí al menos un perfil");
        // Lo ya medido de esos perfiles queda (deletePublications en false).
        await api.quitarPerfiles(id, perfiles);
        return { ok: true };
      case "leer": {
        let total = 0;
        const t0 = Date.now();
        for (let page = 1; page < 100 && Date.now() - t0 < 40_000; page++) {
          const r = await api.publicaciones(id, page);
          await guardarPublicaciones(db, r.data, id);
          total = r.pagination.total;
          if (!r.data.length || page >= r.pagination.totalPages) break;
        }
        await db.from("inf_trackings").update({ publicaciones: total, leido: new Date().toISOString() }).eq("id", id);
        const { error } = await db.rpc("inf_resolver_clientes");
        if (error) throw new Error(error.message);
        return { ok: true, publicaciones: total };
      }
      default:
        throw new Error("Acción desconocida");
    }
  });
}
