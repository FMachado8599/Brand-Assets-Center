import {
  anularLinks,
  asegurarUsuario,
  credencialDe,
  ingresoConContrasenaListo,
  leerJson,
  mailPermitido,
  mismoOrigen,
  noConfigurado,
  responder,
  supabaseAdmin,
  usuarioPorMail,
} from "@/lib/auth/servidor.server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Solo un admin (con su sesión) ve y resuelve los pedidos. */
async function adminActual() {
  const supabase = createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: esAdmin } = await supabase.rpc("es_admin");
  return esAdmin === true ? data.user : null;
}

/** Los pedidos pendientes, con lo que el admin tiene que saber antes de aprobar. */
export async function GET() {
  if (!ingresoConContrasenaListo()) return responder({ pedidos: [] });
  try {
    if (!(await adminActual())) return responder({ error: "Solo un admin puede ver los pedidos" }, 403);
    const { data } = await supabaseAdmin()
      .from("credencial_solicitudes")
      .select("id, email, nombre, created_at")
      .eq("estado", "pendiente")
      .order("created_at", { ascending: false });
    const pedidos = await Promise.all(
      (data ?? []).map(async (p) => {
        const usuario = await usuarioPorMail(String(p.email));
        return {
          ...p,
          permitido: await mailPermitido(String(p.email)),
          ya_tiene_cuenta: Boolean(usuario),
          ya_tiene_contrasena: usuario ? Boolean(await credencialDe(usuario.id)) : false,
        };
      })
    );
    return responder({ pedidos });
  } catch {
    return responder({ error: "No se pudieron leer los pedidos" }, 500);
  }
}

/**
 * Aprobar: el mail pasa a estar permitido (si no lo estaba por su dominio), se crea la cuenta y la
 * contraseña que eligió pasa a valer. Rechazar: se descarta el pedido y su contraseña.
 */
export async function POST(req: Request) {
  if (!ingresoConContrasenaListo()) return noConfigurado();
  if (!mismoOrigen(req)) return responder({ error: "Pedido no válido" }, 403);
  try {
    const admin = await adminActual();
    if (!admin) return responder({ error: "Solo un admin puede aprobar pedidos" }, 403);
    const body = await leerJson(req);
    const accion = body?.accion;
    if (typeof body?.id !== "string" || (accion !== "aprobar" && accion !== "rechazar")) return responder({ error: "Pedido no válido" }, 400);

    const db = supabaseAdmin();
    const { data: pedido } = await db
      .from("credencial_solicitudes")
      .select("id, email, nombre, hash, pepper_version")
      .eq("id", body.id)
      .eq("estado", "pendiente")
      .maybeSingle();
    if (!pedido) return responder({ error: "Ese pedido ya no está pendiente" }, 404);
    const email = String(pedido.email);
    const resuelta = { resuelta_por: admin.id, resuelta_en: new Date().toISOString(), hash: null };

    if (accion === "rechazar") {
      await db.from("credencial_solicitudes").update({ ...resuelta, estado: "rechazada" }).eq("id", pedido.id);
      return responder({ ok: true });
    }

    if (!(await mailPermitido(email))) {
      const { error } = await db.from("allowed_emails").insert({ email, note: `Pidió cuenta · aprobado desde Accesos` });
      if (error && !/duplicate/i.test(error.message)) throw new Error("no se pudo habilitar");
    }
    const userId = await asegurarUsuario(email, String(pedido.nombre));
    const { error } = await db
      .from("credenciales")
      .upsert({ user_id: userId, hash: pedido.hash, pepper_version: pedido.pepper_version, updated_at: new Date().toISOString() });
    if (error) throw new Error("no se pudo guardar la contraseña");
    await anularLinks(email);
    await db.from("credencial_solicitudes").update({ ...resuelta, estado: "aprobada" }).eq("id", pedido.id);
    return responder({ ok: true });
  } catch {
    return responder({ error: "No se pudo resolver el pedido. Probá de nuevo." }, 500);
  }
}
