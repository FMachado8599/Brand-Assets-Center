import { BROWSER_HEADERS } from "@/lib/downloads/http.server";
import { isAllowedMedia, safeFileName } from "@/lib/downloads/links";

/**
 * Baja el archivo a través de este servidor: el navegador no deja ponerle nombre a una descarga de otro
 * dominio (y el CDN de Pinterest ni siquiera habilita CORS). Solo acepta archivos de los CDN de Pinterest
 * e Instagram, para no ser un proxy abierto.
 *
 *   /api/descargas/file?src=<archivo del CDN>&name=<nombre>
 */
export const runtime = "edge";

/** La extensión la decide lo que manda el origen, no el parámetro: un link armado no puede bajar un "video.exe". */
const TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const src = params.get("src") ?? "";
  if (!isAllowedMedia(src)) return new Response("Origen no permitido", { status: 400 });

  const range = req.headers.get("range");
  const upstream = await fetch(src, {
    headers: range ? { ...BROWSER_HEADERS, Range: range } : BROWSER_HEADERS,
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    // Los links de Instagram vencen: un 403 casi siempre es eso.
    return new Response(null, { status: upstream.status === 404 || upstream.status === 403 ? 410 : 502 });
  }

  const type = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const ext = TYPES[type];
  if (!ext) {
    await upstream.body.cancel();
    return new Response("Tipo de archivo no permitido", { status: 415 });
  }

  const name = `${safeFileName(params.get("name") ?? "descarga").replace(/\.[a-z0-9]{1,5}$/i, "")}.${ext}`;
  const headers = new Headers({
    "Content-Type": type,
    "Content-Disposition": attachment(name),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });
  for (const h of ["content-length", "content-range"]) {
    const value = upstream.headers.get(h);
    if (value) headers.set(h, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

function attachment(name: string) {
  const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_");
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
