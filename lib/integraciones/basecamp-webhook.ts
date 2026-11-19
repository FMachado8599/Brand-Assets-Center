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

export type WebhookDestino = { origen: string; bypass: string | null };

/**
 * A dónde le pide la app a Basecamp que mande los avisos, o por qué no puede recibirlos.
 *  · Producción: APP_URL (si es https) o el dominio de producción de Vercel.
 *  · Modo de prueba: un preview con BASECAMP_WEBHOOKS_EN_PREVIEW=1 recibe los avisos en el link fijo
 *    de su rama (VERCEL_BRANCH_URL). Los previews tienen la protección de Vercel: Basecamp entra con
 *    la llave de "Protection Bypass for Automation" (VERCEL_AUTOMATION_BYPASS_SECRET) en la URL.
 *    Conviene prenderlo en una sola rama: cada una que sincronice se queda con los avisos.
 *  · En local y en el resto de los previews, no: así ninguna copia de prueba se los lleva sin querer.
 */
export function webhookDestino(): WebhookDestino | { aviso: string } {
  const app = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (app) {
    return app.startsWith("https://") ? { origen: app, bypass: null } : { aviso: "APP_URL tiene que empezar con https:// para recibir los avisos de Basecamp" };
  }
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (process.env.VERCEL_ENV === "production" && prod) return { origen: `https://${prod}`, bypass: null };

  if (process.env.VERCEL_ENV === "preview" && process.env.BASECAMP_WEBHOOKS_EN_PREVIEW?.trim() === "1") {
    const rama = process.env.VERCEL_BRANCH_URL?.trim();
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
    if (!rama) return { aviso: "Vercel no informó el link fijo de esta rama (VERCEL_BRANCH_URL)" };
    if (!bypass) {
      return {
        aviso:
          "Para recibir los avisos en este preview, activá Protection Bypass for Automation en Vercel (Settings → Deployment Protection) y volvé a hacer el deploy",
      };
    }
    return { origen: `https://${rama}`, bypass };
  }
  return { aviso: "Los avisos al instante se activan al sincronizar desde la app publicada (https)" };
}

export const webhookUrl = (d: WebhookDestino) =>
  `${d.origen}${WEBHOOK_PATH}?llave=${webhookLlave()}${d.bypass ? `&x-vercel-protection-bypass=${encodeURIComponent(d.bypass)}` : ""}`;
