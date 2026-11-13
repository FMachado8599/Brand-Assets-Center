import { isMagnificHost, magnificKey } from "@/lib/magnific/api";
import { verifyFile } from "@/lib/magnific/firma";

/**
 * Baja un archivo de Magnific (un PNG sin fondo de Retoque, un ícono) a través de este servidor (edge, así un
 * archivo grande pasa sin el límite de 4,5 MB de las funciones). Solo URLs que firmó una ruta nuestra
 * (lib/magnific/firma.ts), así no es un proxy abierto.
 *
 *   /api/magnific/archivo?u=<url de Magnific>&e=<vence>&s=<firma>
 */
export const runtime = "edge";

const TYPES = new Set(["image/png", "image/webp", "image/jpeg", "image/svg+xml"]);

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const url = params.get("u") ?? "";
  const exp = Number(params.get("e"));
  const sig = params.get("s") ?? "";
  if (!url || !sig || !Number.isFinite(exp)) return new Response("Faltan datos", { status: 400 });

  const key = magnificKey();
  if (!key) return new Response("Falta configurar MAGNIFIC_API_KEY", { status: 503 });

  const verdict = await verifyFile(url, exp, sig, key);
  if (verdict === "invalid") return new Response("Link inválido", { status: 403 });
  if (verdict === "expired") return new Response("El link venció", { status: 410 });

  const target = new URL(url);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      // Si el archivo está en un dominio de Magnific puede pedir la key; a cualquier otro (un CDN) no se le manda.
      headers: isMagnificHost(target.hostname) ? { "x-magnific-api-key": key, Accept: "image/*" } : { Accept: "image/*" },
      cache: "no-store",
    });
  } catch {
    return new Response("No se pudo bajar el archivo de Magnific", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    // Los archivos de Magnific duran pocos minutos: un 403 o un 404 casi siempre es eso.
    return new Response(null, { status: upstream.status === 404 || upstream.status === 403 ? 410 : 502 });
  }

  // Si el CDN no dice el tipo (o dice uno genérico), se deduce de la extensión: un .svg es SVG, lo demás PNG.
  const sent = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const type = TYPES.has(sent) ? sent : /\.svg$/i.test(target.pathname) ? "image/svg+xml" : "image/png";
  const headers = new Headers({
    "Content-Type": type,
    "Cache-Control": "private, no-store",
    // Un SVG puede traer scripts: si alguien abre este link directo, no corre nada en nuestro dominio.
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { headers });
}
