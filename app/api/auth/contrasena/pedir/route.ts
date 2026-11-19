import { huella } from "@/lib/auth/contrasena.server";
import {
  anotar,
  credencialDe,
  crearLink,
  DEMASIADOS,
  frenado,
  hayMail,
  ingresoConContrasenaListo,
  ipDe,
  leerJson,
  mailPermitido,
  mailValido,
  mandarLink,
  mismoOrigen,
  noConfigurado,
  origenDe,
  responder,
  usuarioPorMail,
  type Limite,
} from "@/lib/auth/servidor.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Crear mi contraseña" / "Me la olvidé": manda por mail un link de un solo uso. La respuesta es siempre
 * la misma, tenga o no acceso ese mail (no se puede usar para averiguar quién está). Sin mail
 * configurado, avisa que el link lo da un admin.
 */
export async function POST(req: Request) {
  if (!ingresoConContrasenaListo()) return noConfigurado();
  if (!mismoOrigen(req)) return responder({ error: "Pedido no válido" }, 403);
  try {
    const body = await leerJson(req);
    const email = mailValido(body?.email);
    if (!email) return responder({ error: "Escribí un mail válido" }, 400);
    if (!hayMail()) return responder({ ok: true, sinMail: true });

    const limites: Limite[] = [
      { clave: `pedido:${huella(email)}`, max: 3, minutos: 60, contar: "todos" },
      { clave: `pedido-ip:${huella(ipDe(req))}`, max: 10, minutos: 60, contar: "todos" },
    ];
    if (await frenado(limites)) return responder({ error: DEMASIADOS }, 429);
    await anotar(limites, false);

    if (await mailPermitido(email)) {
      const usuario = await usuarioPorMail(email);
      const motivo = usuario && (await credencialDe(usuario.id)) ? "recuperar" : "invitacion";
      const token = await crearLink(email, motivo, null);
      await mandarLink(email, `${origenDe(req)}/contrasena?token=${token}`, motivo);
    }
    return responder({ ok: true });
  } catch {
    return responder({ error: "No se pudo mandar el link. Probá de nuevo en un rato." }, 500);
  }
}
