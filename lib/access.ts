import type { SupabaseClient } from "@supabase/supabase-js";
import { STUDIO_DOMAIN } from "@/lib/site";

export type StudioSession = {
  email: string;
  /** El nombre de la cuenta de Google, si lo tiene. */
  name: string | null;
  /** Puede usar las herramientas: mail del estudio o una excepción de allowed_emails. */
  allowed: boolean;
};

/**
 * Quién tiene la sesión y si puede usar las herramientas. null sin sesión.
 * Lo usan el middleware (para dejar pasar o no) e Inicio (panel o presentación).
 */
export async function studioSession(supabase: SupabaseClient): Promise<StudioSession | null> {
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const email = typeof claims?.email === "string" ? claims.email.toLowerCase() : null;
  if (!email) return null;

  let allowed = email.endsWith(`@${STUDIO_DOMAIN}`);
  if (!allowed) {
    // Las excepciones (allowed_emails) solo las conoce la base.
    const { data: ok } = await supabase.rpc("has_access");
    allowed = ok === true;
  }

  const meta = (claims?.user_metadata ?? {}) as Record<string, unknown>;
  const name = [meta.full_name, meta.name].find((v): v is string => typeof v === "string" && v.trim() !== "");
  return { email, name: name?.trim() ?? null, allowed };
}
