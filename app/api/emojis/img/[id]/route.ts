/**
 * Proxy de las imágenes de emojis guardadas en Firebase Storage.
 *
 * Hace falta por dos motivos: el CORS del bucket solo acepta los dominios del
 * proyecto anterior (sin esto, copiar al portapapeles falla en producción), y
 * Firebase responde `Cache-Control: private, max-age=0`, así que cada imagen se
 * volvía a pedir siempre. Acá se sirven inmutables: la CDN y el navegador las
 * guardan una vez y listo.
 *
 *   /api/emojis/img/1f600          → miniatura WebP de 100 px (~3 KB)
 *   /api/emojis/img/1f600?v=full   → PNG de 1000 px (~1,8 MB)
 */

export const runtime = "edge";

const BUCKET = process.env.EMOJI_STORAGE_BUCKET || "camara-focus.firebasestorage.app";
const ID = /^[0-9a-f]{2,6}(?:-[0-9a-f]{2,6}){0,12}$/;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params.id.toLowerCase();
  if (!ID.test(id)) return new Response("Emoji inválido", { status: 400 });

  const full = new URL(req.url).searchParams.get("v") === "full";
  const path = full ? `emojis/apple/${id}.png` : `emojis/apple-placeholders/${id}.webp`;
  const upstream = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`,
    { cache: "no-store" }
  );

  if (!upstream.ok || !upstream.body) {
    return new Response(null, {
      status: upstream.status === 404 ? 404 : 502,
      headers: { "Cache-Control": "public, max-age=300" },
    });
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? (full ? "image/png" : "image/webp"),
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { headers });
}
