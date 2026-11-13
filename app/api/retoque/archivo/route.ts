import { verifyFile } from "@/lib/retoque/firma";
import { isMagnificHost, magnificKey } from "@/lib/retoque/magnific";

/**
 * Baja un resultado de Magnific a través de este servidor (edge, así un PNG grande pasa sin el límite de
 * 4,5 MB de las funciones). Solo URLs que firmó /api/retoque/fondo (lib/retoque/firma.ts), así no es un
 * proxy abierto.
 *
 *   /api/retoque/archivo?u=<url de Magnific>&e=<vence>&s=<firma>
 */
export const runtime = "edge";

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
  if (verdict === "expired") return new Response("El resultado venció", { status: 410 });

  const target = new URL(url);
  const own = isMagnificHost(target.hostname);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      // Si el archivo está en un dominio de Magnific puede pedir la key; a cualquier otro (un CDN) no se le manda.
      headers: own ? { "x-magnific-api-key": key, Accept: "image/*" } : { Accept: "image/*" },
      cache: "no-store",
    });
  } catch {
    return new Response("No se pudo bajar el resultado de Magnific", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    // Los resultados de Magnific duran 5 minutos: un 403 o un 404 casi siempre es eso.
    return new Response(null, { status: upstream.status === 404 || upstream.status === 403 ? 410 : 502 });
  }

  // Siempre es un PNG con transparencia; si el CDN no dice el tipo, se lo pone.
  const type = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const headers = new Headers({
    "Content-Type": /^image\/(png|webp|jpeg)$/.test(type) ? type : "image/png",
    "Cache-Control": "private, no-store",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { headers });
}
