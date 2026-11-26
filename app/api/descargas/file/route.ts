import { BROWSER_HEADERS } from "@/lib/downloads/http.server";
import { isAllowedMedia, isInstagramMedia, isPinterestMedia, safeFileName } from "@/lib/downloads/links";

/**
 * Baja el archivo a través de este servidor: el navegador no deja ponerle nombre a una descarga de otro
 * dominio (y el CDN de Pinterest ni siquiera habilita CORS). Solo acepta archivos de los CDN de Pinterest
 * e Instagram, para no ser un proxy abierto.
 *
 *   /api/descargas/file?src=<archivo del CDN>&name=<nombre>
 *
 * Si algo falla responde texto (no HTML): la página lo muestra tal cual en la fila. Y queda una línea
 * [descargas/file] en los logs de Vercel con lo que respondió el CDN.
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
  if (!isAllowedMedia(src)) return problem("Ese archivo no es de Instagram, Pinterest ni YouTube.", 400);

  const where = isPinterestMedia(src) ? "Pinterest" : isInstagramMedia(src) ? "Instagram" : "YouTube";
  const range = req.headers.get("range");
  const headers: Record<string, string> = { ...BROWSER_HEADERS, Accept: "*/*" };
  // El CDN de Pinterest (Akamai) puede frenar pedidos de servidores que no vienen de una página de Pinterest.
  if (where === "Pinterest") headers.Referer = "https://www.pinterest.com/";
  if (range) headers.Range = range;

  const upstream = await fetchWithRetry(src, headers);
  if (!(upstream instanceof Response)) {
    console.warn(`[descargas/file] ${host(src)}: no respondió (${upstream})`);
    return problem(`${where} no respondió al bajar el archivo. Probá de nuevo en un rato.`, 502);
  }
  if (!upstream.ok || !upstream.body) {
    upstream.body?.cancel().catch(() => {});
    console.warn(`[descargas/file] ${host(src)} respondió ${upstream.status}`);
    // Los links de Instagram vencen: un 403 casi siempre es eso.
    if (where === "Instagram" && (upstream.status === 403 || upstream.status === 404)) {
      return problem("El link del archivo venció: sacá la fila y volvé a pegar el link.", 410);
    }
    if (upstream.status === 404) return problem(`${where} ya no tiene ese archivo.`, 410);
    return problem(`${where} no dejó bajar el archivo (respondió ${upstream.status}).`, 502);
  }

  const type = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const ext = TYPES[type];
  if (!ext) {
    upstream.body.cancel().catch(() => {});
    console.warn(`[descargas/file] ${host(src)} mandó un tipo que no se acepta: "${type}"`);
    return problem(`${where} mandó un tipo de archivo que no reconozco (${type || "sin tipo"}).`, 415);
  }

  const name = `${safeFileName(params.get("name") ?? "descarga").replace(/\.[a-z0-9]{1,5}$/i, "")}.${ext}`;
  const out = new Headers({
    "Content-Type": type,
    "Content-Disposition": attachment(name),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });
  for (const h of ["content-length", "content-range"]) {
    const value = upstream.headers.get(h);
    if (value) out.set(h, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

/**
 * Un segundo intento si la conexión se corta o el CDN responde 5xx (un nodo caído no es el archivo).
 *
 * El `signal` (que nunca se usa para cortar) saca al pedido del fetch de React: sin uno, React (que envuelve el
 * fetch de las rutas) devuelve una copia de la respuesta y se queda con la original sin leer, guardando el
 * archivo entero en memoria mientras se manda; y cancelar el cuerpo de la copia espera a la original, o sea,
 * nunca termina. Si quien baja cierra la página, se cancela el stream y con él el pedido al CDN.
 */
async function fetchWithRetry(src: string, headers: Record<string, string>): Promise<Response | string> {
  const { signal } = new AbortController();
  let last: Response | string = "sin respuesta";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400));
    try {
      const res = await fetch(src, { headers, cache: "no-store", signal });
      if (res.status < 500) return res;
      res.body?.cancel().catch(() => {});
      last = res;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  return last;
}

function problem(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

function host(src: string) {
  try {
    return new URL(src).hostname;
  } catch {
    return "?";
  }
}

function attachment(name: string) {
  const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_");
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
