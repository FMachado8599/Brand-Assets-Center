import { estaFiltrada, hashear, problemaDeContrasena, verificar } from "@/lib/auth/contrasena.server";
import {
  anotar,
  anularLinks,
  credencialDe,
  DEMASIADOS,
  frenado,
  guardarCredencial,
  ingresoConContrasenaListo,
  ipDe,
  leerJson,
  limiteCuenta,
  limiteIp,
  mismoOrigen,
  noConfigurado,
  responder,
} from "@/lib/auth/servidor.server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Desde tu perfil, con la sesión iniciada: crear tu contraseña (si entrás con Google y querés tener
 * una) o cambiarla. Para cambiarla hay que poner la actual.
 */
export async function POST(req: Request) {
  if (!ingresoConContrasenaListo()) return noConfigurado();
  if (!mismoOrigen(req)) return responder({ error: "Pedido no válido" }, 403);
  try {
    const { data } = await createSupabaseServer().auth.getUser();
    const user = data.user;
    const email = user?.email?.toLowerCase();
    if (!user || !email) return responder({ error: "Iniciá sesión" }, 401);

    const limites = [limiteCuenta(email), limiteIp(ipDe(req))];
    if (await frenado(limites)) return responder({ error: DEMASIADOS }, 429);
    const body = await leerJson(req);

    const credencial = await credencialDe(user.id);
    if (credencial && !(await verificar(credencial.hash, String(body?.actual ?? "")))) {
      await anotar(limites, false);
      return responder({ error: "La contraseña actual no es esa" }, 401);
    }
    const nueva = body?.nueva;
    const problema = problemaDeContrasena(nueva, email);
    if (problema) return responder({ error: problema }, 400);
    if (await estaFiltrada(nueva as string)) {
      return responder({ error: "Esa contraseña apareció en filtraciones de datos conocidas. Elegí otra." }, 400);
    }
    await guardarCredencial(user.id, await hashear(nueva as string));
    await anularLinks(email);
    await anotar(limites, true);
    return responder({ ok: true, creada: !credencial });
  } catch {
    return responder({ error: "No se pudo guardar la contraseña. Probá de nuevo en un rato." }, 500);
  }
}
