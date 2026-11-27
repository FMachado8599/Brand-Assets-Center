import { leerEntrada } from "@/lib/plani/acceso.server";
import { responder, tokenValido } from "@/lib/plani/acceso-rutas.server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * La presentación para la página del cliente. Con la entrada de este navegador (o con sesión del
 * estudio) viene entera; sin entrada, solo la portada (el nombre y el logo del cliente) para pedir el mail.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!tokenValido(params.token)) return responder({ estado: "invalido" }, 404);
  try {
    const db = createSupabaseServer();
    const { data, error } = await db.rpc("presentacion_ver", { p_token: params.token, p_sesion: leerEntrada(params.token) });
    if (error) throw new Error(error.message);
    if (data) return responder({ estado: "listo", datos: data });
    const portada = await db.rpc("presentacion_portada", { p_token: params.token });
    if (portada.error) throw new Error(portada.error.message);
    if (!portada.data) return responder({ estado: "invalido" }, 404);
    return responder({ estado: "entrar", portada: portada.data });
  } catch (e) {
    console.error("[p] ver:", e);
    return responder({ estado: "error", error: "No se pudo abrir la presentación" }, 500);
  }
}
