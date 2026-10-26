import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase-server";

/**
 * Si quien entra puede ver las métricas de Descargas (está en descargas_admins, ver
 * supabase/migracion-descargas-registro.sql). "sin-migracion" si la base todavía no la tiene.
 */
export async function downloadsAdmin(): Promise<"si" | "no" | "sin-migracion"> {
  if (!hasSupabaseEnv) return "no";
  const { data, error } = await createSupabaseServer().rpc("is_descargas_admin");
  if (error) return error.code === "PGRST202" || error.code === "42883" ? "sin-migracion" : "no";
  return data === true ? "si" : "no";
}
