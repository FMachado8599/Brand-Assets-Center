import { leerEntrada } from "@/lib/plani/acceso.server";
import { esSinPermiso, mismoOrigen, responder, sinEntrada, tokenValido } from "@/lib/plani/acceso-rutas.server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const ESTADOS = new Set(["pendiente", "aprobada", "cambios"]);

/** El cliente aprueba una pieza o pide cambios. Pide la entrada de este navegador. */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  if (!mismoOrigen(request)) return responder({ error: "Pedido de otro sitio" }, 403);
  if (!tokenValido(params.token)) return responder({ estado: "invalido" }, 404);
  const body = ((await request.json().catch(() => null)) ?? {}) as { pieza?: unknown; estado?: unknown };
  if (typeof body.pieza !== "string" || !UUID.test(body.pieza) || typeof body.estado !== "string" || !ESTADOS.has(body.estado)) {
    return responder({ error: "Pedido inválido" }, 400);
  }
  const { error } = await createSupabaseServer().rpc("presentacion_ver_aprobar", {
    p_token: params.token,
    p_sesion: leerEntrada(params.token),
    p_pieza: body.pieza,
    p_estado: body.estado,
  });
  if (esSinPermiso(error)) return sinEntrada();
  if (error) return responder({ error: "No se pudo guardar" }, 500);
  return responder({ ok: true });
}
