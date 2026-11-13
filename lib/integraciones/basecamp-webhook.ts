import { createHash, createHmac, timingSafeEqual } from "crypto";
import { hasSecret } from "./crypto";

/**
 * Los avisos al instante de Basecamp (webhooks). Basecamp no firma lo que manda, así que la URL
 * lleva una llave: sale de INTEGRACIONES_SECRET (nunca se guarda) y en la base queda solo su hash,
 * contra el que bc_recibir_evento valida cada aviso (supabase/migracion-notificaciones.sql).
 */

export const WEBHOOK_PATH = "/api/basecamp/webhook";

/** Lo que se le pide a Basecamp que avise: lo que la app muestra o usa para el Board. */
export const WEBHOOK_TIPOS = ["Comment", "Kanban::Card", "Kanban::Step", "Message", "Question::Answer", "Todo", "Document"];

export function webhookLlave() {
  const secret = process.env.INTEGRACIONES_SECRET;
  if (!secret || !hasSecret()) throw new Error("Falta INTEGRACIONES_SECRET (al menos 32 caracteres) en las variables del servidor");
  return createHmac("sha256", secret).update("basecamp-webhook-v1").digest("base64url");
}

export const webhookHash = (llave: string) => createHash("sha256").update(llave, "utf8").digest("hex");

/** La llave que trae un aviso es la nuestra (comparada sin filtrar por tiempo cuánto coincide). */
export function llaveValida(recibida: string | null) {
  if (!recibida || !hasSecret()) return false;
  const esperada = Buffer.from(webhookLlave());
  const dada = Buffer.from(recibida);
  return dada.length === esperada.length && timingSafeEqual(dada, esperada);
}

/**
 * El origen público al que Basecamp puede llamar: APP_URL (si es https) o, en Vercel, el dominio de
 * producción. En local y en los previews no hay: así ninguna copia de prueba se queda con los avisos.
 */
export function webhookOrigen(): string | null {
  const app = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (app) return app.startsWith("https://") ? app : null;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (process.env.VERCEL_ENV === "production" && prod) return `https://${prod}`;
  return null;
}

export const webhookUrl = (origen: string) => `${origen}${WEBHOOK_PATH}?llave=${webhookLlave()}`;
