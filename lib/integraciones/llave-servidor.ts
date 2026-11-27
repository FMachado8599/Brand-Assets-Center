import { createHash, createHmac } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasSecret } from "./crypto";

/**
 * Cómo se identifica el servidor de la app ante la base cuando no hay sesión de nadie (la página
 * del cliente). La llave sale de INTEGRACIONES_SECRET, que vive solo en Vercel: no se guarda en
 * ningún lado y en la base queda solo su hash (servidor_llaves, en migracion-plani-cliente.sql).
 */

/** drive: el material de la presentación del cliente · slack: los avisos que salen sin sesión. */
export type UsoLlave = "drive" | "slack";

export function llaveServidor(uso: UsoLlave) {
  const secret = process.env.INTEGRACIONES_SECRET;
  if (!secret || !hasSecret()) throw new Error("Falta INTEGRACIONES_SECRET (al menos 32 caracteres) en las variables del servidor");
  return createHmac("sha256", secret).update(`servidor-${uso}-v1`).digest("base64url");
}

const hash = (llave: string) => createHash("sha256").update(llave, "utf8").digest("hex");

/**
 * Anota el hash de la llave en la base. Lo puede hacer solo un admin (al conectar el Drive o al
 * sincronizar): si cambia INTEGRACIONES_SECRET, la próxima vez queda al día. Nunca frena lo demás.
 */
export async function anotarLlaveServidor(db: SupabaseClient, uso: UsoLlave) {
  if (!hasSecret()) return false;
  const { error } = await db.rpc("servidor_guardar_llave", { p_uso: uso, p_hash: hash(llaveServidor(uso)) });
  return !error;
}
