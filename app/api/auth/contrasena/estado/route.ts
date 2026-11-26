import { credencialDe, hayMail, ingresoConContrasenaListo, responder } from "@/lib/auth/servidor.server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Si este entorno tiene el ingreso con contraseña (y mail), y si vos ya tenés una (con sesión). */
export async function GET() {
  if (!ingresoConContrasenaListo()) return responder({ configurado: false, tiene: false, mail: false });
  try {
    const { data } = await createSupabaseServer().auth.getUser();
    // Sin sesión (/ingresar) solo dice qué está disponible en este entorno.
    if (!data.user) return responder({ configurado: true, tiene: false, mail: hayMail() });
    return responder({ configurado: true, tiene: Boolean(await credencialDe(data.user.id)), mail: hayMail() });
  } catch {
    return responder({ configurado: true, tiene: false, mail: hayMail() });
  }
}
