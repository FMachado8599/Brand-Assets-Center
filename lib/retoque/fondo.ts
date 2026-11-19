import { MagnificError, magnificPost } from "@/lib/magnific/api";

/**
 * Quitar el fondo. Es de las pocas funciones de Magnific que contestan al toque (no dejan una tarea para
 * consultar después). Devuelve la URL del PNG en tamaño completo, que vence a los 5 minutos.
 */
export async function removeBackground(imageUrl: string): Promise<{ url: string }> {
  const body = await magnificPost("/ai/beta/remove-background", new URLSearchParams({ image_url: imageUrl }));
  const url = [body?.high_resolution, body?.url].find((u): u is string => typeof u === "string" && u.startsWith("https://"));
  if (!url) throw new MagnificError("Magnific no devolvió la imagen sin fondo");
  return { url };
}
