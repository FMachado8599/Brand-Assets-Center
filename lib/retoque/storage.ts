/**
 * Dónde espera la imagen mientras Magnific la procesa. Magnific solo recibe la imagen por URL, así que el
 * navegador la sube a un bucket privado de Supabase, el servidor le pasa a Magnific un link firmado que vence
 * a los 10 minutos y, apenas termina, la borra. Cada persona solo ve su carpeta (supabase/migracion-retoque.sql).
 */
export const RETOQUE_BUCKET = "retoque";

/** Lo que acepta Magnific para quitar el fondo. Lo demás se pasa a JPG en el navegador antes de subirlo. */
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PIXELS = 25_000_000;

export type InputExt = "jpg" | "png";

/** `<id de la cuenta>/<uuid>.jpg`: el único formato de ruta que acepta /api/retoque/fondo. */
export function inputPath(userId: string, ext: InputExt) {
  return `${userId}/${crypto.randomUUID()}.${ext}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^(${UUID})/${UUID}\\.(jpg|png)$`);

/** La ruta es de esa cuenta y tiene la forma de inputPath: el servidor no firma otra cosa. */
export function isOwnPath(path: string, userId: string) {
  return PATH.exec(path)?.[1] === userId;
}

/** Los errores de Storage, en criollo. El más común: todavía no se corrió la migración. */
export function storageMessage(error: { message?: string; statusCode?: string | number } | null | undefined) {
  const text = error?.message ?? "";
  if (/bucket not found/i.test(text)) {
    return "Falta activar Retoque en Supabase: corré supabase/migracion-retoque.sql (ver README, Retoque).";
  }
  if (/row-level security|unauthorized|not authorized/i.test(text)) {
    return "Tu cuenta no tiene permiso para subir a Retoque. ¿Se corrió supabase/migracion-retoque.sql?";
  }
  if (/object not found|not found/i.test(text)) return "La imagen subida ya no está: reintentá.";
  if (/exceeded|too large|payload/i.test(text)) return "La imagen pesa más de lo que acepta Retoque (20 MB).";
  return text || "No se pudo guardar la imagen";
}
