import { NextResponse } from "next/server";

/**
 * Cliente mínimo de la API de Magnific (la ex API de Freepik) para el servidor. La key vive solo acá: el
 * navegador habla con nuestras rutas /api/retoque/*, nunca con Magnific.
 */

const BASE = "https://api.magnific.com/v1";

export class MagnificError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export function magnificKey() {
  return process.env.MAGNIFIC_API_KEY?.trim() || null;
}

export function hasMagnificKey() {
  return Boolean(magnificKey());
}

/** Los dominios de Magnific: solo a ellos se les manda la key al bajar un resultado. */
export function isMagnificHost(hostname: string) {
  return ["magnific.com", "freepik.com"].some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

/**
 * Quitar el fondo. Es de las pocas funciones de Magnific que contestan al toque (no dejan una tarea para
 * consultar después). Devuelve la URL del PNG en tamaño completo, que vence a los 5 minutos.
 */
export async function removeBackground(imageUrl: string): Promise<{ url: string }> {
  const body = await call("/ai/beta/remove-background", new URLSearchParams({ image_url: imageUrl }));
  const url = [body?.high_resolution, body?.url].find((u): u is string => typeof u === "string" && u.startsWith("https://"));
  if (!url) throw new MagnificError("Magnific no devolvió la imagen sin fondo");
  return { url };
}

async function call(path: string, form: URLSearchParams) {
  const key = magnificKey();
  if (!key) throw new MagnificError("Falta configurar MAGNIFIC_API_KEY", 503);

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: "POST",
      headers: {
        "x-magnific-api-key": key,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new MagnificError(timeout ? "Magnific tardó demasiado: reintentá" : "No se pudo hablar con Magnific", 504);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new MagnificError(explain(res.status, body), res.status === 429 ? 429 : res.status < 500 ? 422 : 502);
  return body;
}

/** Lo que contesta Magnific cuando algo sale mal, para que se entienda en la tarjeta. */
function explain(status: number, body: any) {
  const detail = [body?.message, body?.detail, body?.error, body?.errors?.[0]?.message].find(
    (v): v is string => typeof v === "string" && v.trim() !== ""
  );
  if (status === 401) return "Magnific no aceptó la API key: revisá MAGNIFIC_API_KEY";
  if (status === 402) return "No quedan créditos en Magnific";
  if (status === 403) return detail ? `Magnific no lo permite: ${detail}` : "El plan de Magnific no incluye esta función";
  if (status === 429) return "Demasiados pedidos a Magnific: esperá un momento y reintentá";
  if (status >= 500) return `Magnific falló (${status}): reintentá en un rato`;
  return detail ?? `Magnific no pudo procesar la imagen (${status})`;
}

export function errorResponse(e: unknown) {
  const status = e instanceof MagnificError ? e.status : 500;
  const message = e instanceof Error ? e.message : "Algo falló";
  return NextResponse.json({ error: message }, { status: status >= 400 && status < 600 ? status : 500 });
}
