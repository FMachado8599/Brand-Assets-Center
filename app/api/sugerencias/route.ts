import { NextResponse } from "next/server";
import { FEEDBACK_EMAIL, STUDIO } from "@/lib/site";
import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Sugerencias y errores del Inicio. Se guardan en la base (enviar_sugerencia, ver
 * supabase/migracion-sugerencias.sql) y aparecen en el tablero del estudio. Si Resend
 * está configurado (https://resend.com), además llega un mail:
 *
 *   RESEND_API_KEY   opcional: sin ella no hay mail, pero la sugerencia queda en el tablero
 *   FEEDBACK_TO      a quién llegan (por defecto FEEDBACK_EMAIL)
 *   FEEDBACK_FROM    remitente. Sin dominio verificado en Resend se usa
 *                    onboarding@resend.dev, que solo puede mandar al mail de
 *                    la cuenta de Resend: creala con el mismo mail que recibe.
 *
 * Con sesión del estudio se puede firmar con nombre y foto (showIdentity). Sin sesión
 * se manda anónima o con el nombre escrito, y no se ve el tablero.
 */

type Kind = "sugerencia" | "error";

const LIMITS = { message: 5000, name: 80, page: 200 };
/** Unos pocos envíos por minuto por IP alcanzan para el equipo y frenan a un bot. */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function tooMany(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 500) recent.delete(recent.keys().next().value!);
  return hits.length > MAX_PER_WINDOW;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });

  // Campo trampa: invisible para las personas, los bots lo llenan. Se responde "ok" sin mandar nada.
  if (clean(body.website, 200)) return NextResponse.json({ ok: true });

  const kind: Kind = body.kind === "error" ? "error" : "sugerencia";
  const message = clean(body.message, LIMITS.message);
  const name = clean(body.name, LIMITS.name);
  const page = clean(body.page, LIMITS.page);
  if (message.length < 3) return NextResponse.json({ error: "Escribí el mensaje" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (tooMany(ip)) return NextResponse.json({ error: "Demasiados envíos seguidos: probá en un minuto" }, { status: 429 });

  // 1. Al tablero. Con la sesión de quien manda: la base decide si firma o va anónima.
  let saved: string | null = null;
  if (hasSupabaseEnv) {
    const supabase = createSupabaseServer();
    const { data, error } = await supabase.rpc("enviar_sugerencia", {
      p_kind: kind === "error" ? "error" : "idea",
      p_body: message,
      p_show_identity: body.showIdentity === true,
      p_name: name || null,
      p_page: page || null,
    });
    if (error) console.error("[sugerencias] no se pudo guardar:", error.message);
    else saved = typeof data === "string" ? data : "ok";
  }

  // 2. El mail, si está configurado. Si no, alcanza con el tablero.
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (saved) return NextResponse.json({ ok: true, id: saved });
    console.warn("[sugerencias] no se pudo guardar y falta RESEND_API_KEY para el mail");
    return NextResponse.json({ error: "No se pudo mandar: probá de nuevo en un rato" }, { status: 503 });
  }

  const label = kind === "error" ? "Error" : "Sugerencia";
  const who = name || "Anónimo";
  const firstLine = message.split("\n")[0].slice(0, 60);
  const when = new Intl.DateTimeFormat("es-UY", { dateStyle: "long", timeStyle: "short", timeZone: "America/Montevideo" }).format(new Date());

  const text = [`${label} de ${who}`, "", message, "", "—", `Enviado el ${when}${page ? ` desde ${page}` : ""}.`].join("\n");
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#141414;max-width:560px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#888">${label} · Herramientas</p>
      <p style="margin:0 0 16px;font-weight:600">De ${escape(who)}</p>
      <div style="white-space:pre-wrap;padding:14px 16px;background:#f4f1ea;border-radius:10px">${escape(message)}</div>
      <p style="margin:16px 0 0;font-size:12px;color:#888">Enviado el ${escape(when)}${page ? ` desde ${escape(page)}` : ""}.</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.FEEDBACK_FROM || `Herramientas ${STUDIO} <onboarding@resend.dev>`,
      to: [process.env.FEEDBACK_TO || FEEDBACK_EMAIL],
      subject: `[${label}] ${firstLine}${message.length > firstLine.length ? "…" : ""}`,
      text,
      html,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e: unknown) => {
    console.error("[sugerencias] no se pudo contactar a Resend:", e);
    return null;
  });

  if (!res?.ok) {
    if (res) console.error("[sugerencias] Resend respondió", res.status, await res.text().catch(() => ""));
    // Si quedó en el tablero, para quien la mandó salió bien: solo faltó el mail.
    if (!saved) return NextResponse.json({ error: "No se pudo mandar: probá de nuevo en un rato" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, id: saved });
}
