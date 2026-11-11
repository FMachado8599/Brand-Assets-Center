import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Los tokens de Basecamp y de Google se guardan cifrados (AES-256-GCM). La clave sale de
 * INTEGRACIONES_SECRET, que vive solo en el servidor: quien lea la tabla integraciones no puede
 * usar las cuentas. Cambiar la clave obliga a volver a conectar.
 */

function key() {
  const secret = process.env.INTEGRACIONES_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Falta INTEGRACIONES_SECRET (al menos 32 caracteres) en las variables del servidor");
  }
  return createHash("sha256").update(secret).digest();
}

export const hasSecret = () => (process.env.INTEGRACIONES_SECRET?.length ?? 0) >= 32;

/** "v1.<iv>.<tag>.<cifrado>", todo en base64url. */
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decrypt(sealed: string) {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Token guardado en un formato desconocido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Un valor al azar para el parámetro state de OAuth. */
export const randomState = () => randomBytes(24).toString("base64url");
