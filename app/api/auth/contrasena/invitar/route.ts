import {
  credencialDe,
  crearLink,
  HORAS_LINK,
  hayMail,
  ingresoConContrasenaListo,
  leerJson,
  mailPermitido,
  mailValido,
  mandarLink,
  mismoOrigen,
  noConfigurado,
  origenDe,
  responder,
  usuarioPorMail,
} from "@/lib/auth/servidor.server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Un admin genera el link para que alguien cree (o cambie) su contraseña: se lo copia para mandarlo por
 * WhatsApp o Slack y, si hay mail configurado, además le llega por mail. Dura 72 horas y sirve una vez.
 */
export async function POST(req: Request) {
  if (!ingresoConContrasenaListo()) return noConfigurado();
  if (!mismoOrigen(req)) return responder({ error: "Pedido no válido" }, 403);
  try {
    const supabase = createSupabaseServer();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return responder({ error: "Iniciá sesión" }, 401);
    const { data: esAdmin } = await supabase.rpc("es_admin");
    if (esAdmin !== true) return responder({ error: "Solo un admin puede generar links" }, 403);

    const body = await leerJson(req);
    const email = mailValido(body?.email);
    if (!email) return responder({ error: "Escribí un mail válido" }, 400);
    if (!(await mailPermitido(email))) {
      return responder({ error: "Ese mail todavía no tiene acceso: sumá el mail o su dominio arriba." }, 400);
    }
    const usuario = await usuarioPorMail(email);
    const motivo = usuario && (await credencialDe(usuario.id)) ? "recuperar" : "invitacion";
    const horas = HORAS_LINK.invitacion;
    const token = await crearLink(email, motivo, data.user.id, horas);
    const link = `${origenDe(req)}/contrasena?token=${token}`;
    const enviado = body?.mandar === false ? false : await mandarLink(email, link, motivo, horas);
    return responder({ link, enviado, hayMail: hayMail(), horas, motivo });
  } catch {
    return responder({ error: "No se pudo generar el link. Probá de nuevo." }, 500);
  }
}
