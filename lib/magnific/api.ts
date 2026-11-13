import { NextResponse } from "next/server";

/**
 * Cliente mínimo de la API de Magnific (la ex API de Freepik) para el servidor. Lo usan Retoque (quitar
 * fondo) y la librería de Íconos. La key vive solo acá: el navegador habla con nuestras rutas, nunca con
 * Magnific.
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

/** Los dominios de Magnific: solo a ellos se les manda la key al bajar un archivo. */
export function isMagnificHost(hostname: string) {
  return ["magnific.com", "freepik.com"].some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

export function magnificPost(path: string, form: URLSearchParams) {
  return call(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    cache: "no-store",
  });
}

/** Las búsquedas se guardan un rato en la caché de datos de Next: la misma búsqueda no se vuelve a pedir. */
export function magnificGet(path: string, params?: URLSearchParams, revalidate = 0) {
  const qs = params?.toString();
  return call(qs ? `${path}?${qs}` : path, revalidate ? { next: { revalidate } } : { cache: "no-store" });
}

async function call(path: string, init: RequestInit & { next?: { revalidate: number } }) {
  const key = magnificKey();
  if (!key) throw new MagnificError("Falta configurar MAGNIFIC_API_KEY", 503);

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { ...init.headers, "x-magnific-api-key": key, Accept: "application/json" },
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

/** Lo que contesta Magnific cuando algo sale mal, para que se entienda en la página. */
function explain(status: number, body: any) {
  const detail = [body?.message, body?.detail, body?.error, body?.errors?.[0]?.message].find(
    (v): v is string => typeof v === "string" && v.trim() !== ""
  );
  if (status === 401) return "Magnific no aceptó la API key: revisá MAGNIFIC_API_KEY";
  if (status === 402) return "No quedan créditos en Magnific";
  if (status === 403) return detail ? `Magnific no lo permite: ${detail}` : "El plan de Magnific no incluye esta función";
  if (status === 404) return detail ?? "Magnific no lo encontró";
  if (status === 429) return "Demasiados pedidos a Magnific: esperá un momento y reintentá";
  if (status >= 500) return `Magnific falló (${status}): reintentá en un rato`;
  return detail ?? `Magnific no pudo hacerlo (${status})`;
}

export function errorResponse(e: unknown) {
  const status = e instanceof MagnificError ? e.status : 500;
  const message = e instanceof Error ? e.message : "Algo falló";
  return NextResponse.json({ error: message }, { status: status >= 400 && status < 600 ? status : 500 });
}
