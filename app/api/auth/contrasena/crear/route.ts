import { estaFiltrada, hashear, huella, problemaDeContrasena } from "@/lib/auth/contrasena.server";
import {
  anotar,
  anularLinks,
  asegurarUsuario,
  credencialDe,
  DEMASIADOS,
  frenado,
  guardarCredencial,
  ingresoConContrasenaListo,
  iniciarSesion,
  ipDe,
  leerJson,
  leerLink,
  mailPermitido,
  mismoOrigen,
  noConfigurado,
  responder,
  usarLink,
  usuarioPorMail,
  type Limite,
} from "@/lib/auth/servidor.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_SIRVE = "Este link ya no sirve: venció o ya se usó. Pedí otro.";

const limiteLinks = (req: Request): Limite => ({ clave: `link-ip:${huella(ipDe(req))}`, max: 20, minutos: 15 });

/** Lo que muestra /contrasena antes de escribir: de quién es el link y si la cuenta es nueva. */
export async function GET(req: Request) {
  if (!ingresoConContrasenaListo()) return noConfigurado();
  try {
    const limites = [limiteLinks(req)];
    if (await frenado(limites)) return responder({ error: DEMASIADOS }, 429);
    const link = await leerLink(new URL(req.url).searchParams.get("token"));
    if (!link) {
      await anotar(limites, false);
      return responder({ valido: false, error: NO_SIRVE });
    }
    const usuario = await usuarioPorMail(link.email);
    return responder({
      valido: true,
      email: link.email,
      nuevo: !usuario,
      tiene: usuario ? Boolean(await credencialDe(usuario.id)) : false,
    });
  } catch {
    return responder({ valido: false, error: "No se pudo leer el link. Probá de nuevo en un rato." }, 500);
  }
}

/**
 * Crear (o cambiar) la contraseña con un link de un solo uso. Revisa la política (largo, que no
 * contenga el mail, que no esté en filtraciones), la guarda con Argon2id, anula los demás links de ese
 * mail y deja la sesión iniciada.
 */
export async function POST(req: Request) {
  if (!ingresoConContrasenaListo()) return noConfigurado();
  if (!mismoOrigen(req)) return responder({ error: "Pedido no válido" }, 403);
  try {
    const limites = [limiteLinks(req)];
    if (await frenado(limites)) return responder({ error: DEMASIADOS }, 429);
    const body = await leerJson(req);
    const link = await leerLink(body?.token);
    if (!link) {
      await anotar(limites, false);
      return responder({ error: NO_SIRVE }, 400);
    }
    if (!(await mailPermitido(link.email))) return responder({ error: "Ese mail ya no tiene acceso. Pedíselo a un admin." }, 403);

    const contrasena = body?.contrasena;
    const problema = problemaDeContrasena(contrasena, link.email);
    if (problema) return responder({ error: problema }, 400);
    if (await estaFiltrada(contrasena as string)) {
      return responder({ error: "Esa contraseña apareció en filtraciones de datos conocidas. Elegí otra." }, 400);
    }
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim().replace(/\s+/g, " ").slice(0, 80) || null : null;

    // El link se gasta recién acá: una contraseña que no cumple no lo quema.
    if (!(await usarLink(link.id))) return responder({ error: NO_SIRVE }, 400);
    const userId = await asegurarUsuario(link.email, nombre);
    await guardarCredencial(userId, await hashear(contrasena as string));
    await anularLinks(link.email);
    await iniciarSesion(link.email);
    return responder({ ok: true });
  } catch {
    return responder({ error: "No se pudo guardar la contraseña. Pedí otro link y probá de nuevo." }, 500);
  }
}
