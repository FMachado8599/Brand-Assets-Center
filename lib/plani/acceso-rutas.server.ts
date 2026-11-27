import "server-only";
import { NextResponse } from "next/server";
import { VALID_TOKEN } from "./acceso.server";

/** Lo que comparten las rutas de /api/p/[token]: respuestas sin caché y el chequeo de que el pedido viene de la app. */

const SIN_CACHE = { "Cache-Control": "no-store" };

export const responder = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: SIN_CACHE });

export const tokenValido = (token: string) => VALID_TOKEN.test(token);

/** Sin entrada (o se venció): la página vuelve a pedir el mail. */
export const sinEntrada = () => responder({ estado: "entrar", error: "Tu entrada venció. Volvé a poner tu mail." }, 401);

export const esSinPermiso = (e: { code?: string; message?: string } | null) => Boolean(e && (e.code === "42501" || /Sin entrada/i.test(e.message ?? "")));

/** Los pedidos que cambian algo tienen que venir de la misma app (frena el CSRF). */
export function mismoOrigen(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
