import { safeFileName } from "@/lib/downloads/links";
import { isGiphyMedia } from "@/lib/library/gifs";

/**
 * Baja un GIF (o su MP4 o WEBP) a través de este servidor, para que salga con su nombre: el navegador no deja
 * ponerle nombre a una descarga de otro dominio. Solo archivos de GIPHY, así no es un proxy abierto.
 *
 *   /api/library/gifs/archivo?src=<archivo de GIPHY>&name=<nombre>
 */
export const runtime = "edge";

/** La extensión la decide lo que manda GIPHY, no el parámetro. */
const TYPES: Record<string, string> = { "image/gif": "gif", "video/mp4": "mp4", "image/webp": "webp" };

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const src = params.get("src") ?? "";
  if (!isGiphyMedia(src)) return new Response("Origen no permitido", { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(src, { cache: "no-store" });
  } catch {
    return new Response("No se pudo bajar el archivo de GIPHY", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) return new Response(null, { status: upstream.status === 404 ? 404 : 502 });

  const type = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const ext = TYPES[type];
  if (!ext) {
    await upstream.body.cancel();
    return new Response("Tipo de archivo no permitido", { status: 415 });
  }

  const name = `${safeFileName(params.get("name") ?? "gif").replace(/\.[a-z0-9]{1,5}$/i, "")}.${ext}`;
  const headers = new Headers({
    "Content-Type": type,
    "Content-Disposition": attachment(name),
    "Cache-Control": "private, max-age=3600",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { headers });
}

function attachment(name: string) {
  const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
