import { estaFiltrada, hashear, huella, PEPPER_VERSION, problemaDeContrasena } from "@/lib/auth/contrasena.server";
import {
  anotar,
  DEMASIADOS,
  frenado,
  ingresoConContrasenaListo,
  ipDe,
  leerJson,
  mailValido,
  mismoOrigen,
  noConfigurado,
  responder,
  supabaseAdmin,
  type Limite,
} from "@/lib/auth/servidor.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pedir una cuenta desde /ingresar: nombre, mail y contraseña. Queda pendiente hasta que un admin la
 * aprueba en Ajustes → Accesos. La respuesta es siempre la misma (no dice si el mail ya tenía cuenta).
 */
export async function POST(req: Request) {
  if (!ingresoConContrasenaListo()) return noConfigurado();
  if (!mismoOrigen(req)) return responder({ error: "Pedido no válido" }, 403);
  try {
    const body = await leerJson(req);
    const email = mailValido(body?.email);
    if (!email) return responder({ error: "Escribí un mail válido" }, 400);
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim().replace(/\s+/g, " ").slice(0, 80) : "";
    if (!nombre) return responder({ error: "Escribí tu nombre" }, 400);
    const contrasena = body?.contrasena;
    const problema = problemaDeContrasena(contrasena, email);
    if (problema) return responder({ error: problema }, 400);

    const limites: Limite[] = [
      { clave: `registro-ip:${huella(ipDe(req))}`, max: 5, minutos: 60, contar: "todos" },
      { clave: `registro:${huella(email)}`, max: 3, minutos: 60, contar: "todos" },
    ];
    if (await frenado(limites)) return responder({ error: DEMASIADOS }, 429);
    await anotar(limites, false);

    if (await estaFiltrada(contrasena as string)) {
      return responder({ error: "Esa contraseña apareció en filtraciones de datos conocidas. Elegí otra." }, 400);
    }
    const db = supabaseAdmin();
    // Un pedido nuevo para el mismo mail reemplaza al pendiente (el admin ve cuándo se hizo).
    await db.from("credencial_solicitudes").delete().eq("email", email).eq("estado", "pendiente");
    const { error } = await db
      .from("credencial_solicitudes")
      .insert({ email, nombre, hash: await hashear(contrasena as string), pepper_version: PEPPER_VERSION });
    if (error) throw new Error("no se pudo guardar");
    return responder({ ok: true });
  } catch {
    return responder({ error: "No se pudo mandar el pedido. Probá de nuevo en un rato." }, 500);
  }
}
