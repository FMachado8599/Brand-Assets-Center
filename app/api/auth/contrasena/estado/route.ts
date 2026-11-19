import { credencialDe, hayMail, ingresoConContrasenaListo, responder } from "@/lib/auth/servidor.server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Para tu perfil: si este entorno tiene el ingreso con contraseña y si vos ya tenés una. */
export async function GET() {
  if (!ingresoConContrasenaListo()) return responder({ configurado: false, tiene: false, mail: false });
  try {
    const { data } = await createSupabaseServer().auth.getUser();
    if (!data.user) return responder({ error: "Iniciá sesión" }, 401);
    return responder({ configurado: true, tiene: Boolean(await credencialDe(data.user.id)), mail: hayMail() });
  } catch {
    return responder({ configurado: true, tiene: false, mail: hayMail() });
  }
}
