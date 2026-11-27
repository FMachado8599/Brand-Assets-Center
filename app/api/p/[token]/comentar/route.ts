import { leerEntrada } from "@/lib/plani/acceso.server";
import { esSinPermiso, mismoOrigen, responder, sinEntrada, tokenValido } from "@/lib/plani/acceso-rutas.server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/** Un comentario del cliente (en una pieza o en toda la presentación). Pide la entrada de este navegador. */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  if (!mismoOrigen(request)) return responder({ error: "Pedido de otro sitio" }, 403);
  if (!tokenValido(params.token)) return responder({ estado: "invalido" }, 404);
  const body = ((await request.json().catch(() => null)) ?? {}) as { pieza?: unknown; nombre?: unknown; texto?: unknown };
  const pieza = typeof body.pieza === "string" && UUID.test(body.pieza) ? body.pieza : null;
  const nombre = typeof body.nombre === "string" ? body.nombre.trim().slice(0, 80) : "";
  const texto = typeof body.texto === "string" ? body.texto.trim().slice(0, 4000) : "";
  if (!nombre || !texto) return responder({ error: "Faltan tu nombre o el comentario" }, 400);
  const { error } = await createSupabaseServer().rpc("presentacion_ver_comentar", {
    p_token: params.token,
    p_sesion: leerEntrada(params.token),
    p_pieza: pieza,
    p_nombre: nombre,
    p_texto: texto,
  });
  if (esSinPermiso(error)) return sinEntrada();
  if (error) return responder({ error: "No se pudo enviar el comentario" }, 500);
  return responder({ ok: true });
}
