import { createHash, randomBytes } from "crypto";

/**
 * El link para que un admin de Basecamp autorice la conexión del estudio sin entrar a la app. Lo genera
 * un admin de la app; vale 24 h y una sola vez. La base guarda solo el hash de la llave
 * (supabase/migracion-basecamp-conexion.sql).
 */

export const AUTORIZAR_PATH = "/api/integraciones/basecamp/autorizar";
/** La pantalla pública donde termina quien autorizó con el link (no necesita entrar a la app). */
export const PANTALLA_AUTORIZADO = "/basecamp/autorizado";

export const nuevaLlave = () => randomBytes(24).toString("base64url");
export const hashLlave = (llave: string) => createHash("sha256").update(llave, "utf8").digest("hex");
