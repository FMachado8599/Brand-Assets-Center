import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Registro de visitas: una fila por página vista, en la tabla visits.
 *
 *  - Con sesión: se guarda el usuario (lo saca el servidor de la cookie de sesión).
 *  - Invitado: se guarda un id anónimo (cookie "vid", un año), para contar
 *    personas distintas sin saber quiénes son.
 *
 * No se guarda la IP. Los resúmenes están en las vistas visitas_por_dia y
 * visitas_por_usuario (ver supabase/migracion-usuarios.sql).
 */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|vercel-screenshot/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Del referrer solo interesa de qué sitio venían, no la URL completa. */
function referrerHost(value: unknown, ownHost: string | null) {
  if (typeof value !== "string" || !value) return null;
  try {
    const host = new URL(value).host;
    return host && host !== ownHost ? host.slice(0, 120) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" && body.path.startsWith("/") ? body.path.slice(0, 200) : null;
  if (!path) return NextResponse.json({ error: "path inválido" }, { status: 400 });

  const userAgent = req.headers.get("user-agent") ?? "";
  if (!hasSupabaseEnv || BOT.test(userAgent)) return new NextResponse(null, { status: 204 });

  let visitor = cookies().get("vid")?.value;
  const newVisitor = !visitor || !UUID.test(visitor);
  if (newVisitor) visitor = crypto.randomUUID();

  try {
    const supabase = createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("visits").insert({
      path,
      referrer: referrerHost(body?.referrer, new URL(req.url).host),
      user_id: user?.id ?? null,
      visitor_id: visitor,
      user_agent: userAgent.slice(0, 300) || null,
      country: req.headers.get("x-vercel-ip-country"),
    });
    if (error) console.error("[visitas] no se pudo registrar:", error.message);
  } catch (e) {
    // Una visita sin registrar no puede romper la página.
    console.error("[visitas]", e instanceof Error ? e.message : e);
  }

  const res = new NextResponse(null, { status: 204 });
  if (newVisitor) {
    res.cookies.set("vid", visitor!, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return res;
}
