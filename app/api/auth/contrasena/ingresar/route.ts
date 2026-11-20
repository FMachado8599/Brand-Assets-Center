import { hashear, hayQueRehashear, verificar } from "@/lib/auth/contrasena.server";
import {
  anotar,
  credencialDe,
  DEMASIADOS,
  destinoSeguro,
  frenado,
  guardarCredencial,
  ingresoConContrasenaListo,
  iniciarSesion,
  ipDe,
  leerJson,
  limiteCuenta,
  limiteIp,
  mailPermitido,
  mailValido,
  mismoOrigen,
  noConfigurado,
  responder,
  usuarioPorMail,
} from "@/lib/auth/servidor.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Siempre el mismo mensaje: no se puede saber si el mail tiene cuenta o si erró la contraseña. */
const INCORRECTO = "Mail o contraseña incorrectos";

/**
 * Entrar con mail y contraseña. Frena la fuerza bruta (por cuenta y por IP), verifica con Argon2id y,
 * si está bien y el mail sigue teniendo acceso, deja la sesión iniciada en las cookies.
 * La contraseña no se loguea ni se devuelve en ningún error.
 */
export async function POST(req: Request) {
  if (!ingresoConContrasenaListo()) return noConfigurado();
  if (!mismoOrigen(req)) return responder({ error: "Pedido no válido" }, 403);
  try {
    const body = await leerJson(req);
    const email = mailValido(body?.email);
    const contrasena = body?.contrasena;
    if (!email || typeof contrasena !== "string" || !contrasena) return responder({ error: INCORRECTO }, 400);

    const limites = [limiteCuenta(email), limiteIp(ipDe(req))];
    if (await frenado(limites)) return responder({ error: DEMASIADOS }, 429);

    const usuario = await usuarioPorMail(email);
    const credencial = usuario ? await credencialDe(usuario.id) : null;
    // Sin cuenta o sin contraseña igual se verifica (contra un relleno): tarda lo mismo.
    const ok = await verificar(credencial?.hash ?? null, contrasena);
    if (!ok || !usuario || !credencial) {
      await anotar(limites, false);
      return responder({ error: INCORRECTO }, 401);
    }
    if (!(await mailPermitido(email))) {
      await anotar(limites, false);
      return responder({ error: "Esa cuenta ya no tiene acceso. Si tendría que tenerlo, pedíselo a un admin." }, 403);
    }
    // Si el hash es de parámetros viejos, se aprovecha que la contraseña está bien para rehacerlo.
    if (hayQueRehashear(credencial.hash, credencial.pepper_version)) {
      await guardarCredencial(usuario.id, await hashear(contrasena)).catch(() => undefined);
    }
    await iniciarSesion(email);
    await anotar(limites, true);
    return responder({ ok: true, destino: destinoSeguro(body?.destino) });
  } catch {
    return responder({ error: "No se pudo iniciar la sesión. Probá de nuevo en un rato." }, 500);
  }
}
