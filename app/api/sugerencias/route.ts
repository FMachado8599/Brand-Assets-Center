import { NextResponse } from "next/server";
import { FEEDBACK_EMAIL, STUDIO } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Sugerencias y errores del Inicio: llegan por mail (con Resend, https://resend.com).
 *
 *   RESEND_API_KEY   obligatoria
 *   FEEDBACK_TO      a quién llegan (por defecto FEEDBACK_EMAIL)
 *   FEEDBACK_FROM    remitente. Sin dominio verificado en Resend se usa
 *                    onboarding@resend.dev, que solo puede mandar al mail de
 *                    la cuenta de Resend: creala con el mismo mail que recibe.
 *
 * No se guarda nada: el mail es el registro.
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

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[sugerencias] falta RESEND_API_KEY: no se puede mandar el mail");
    return NextResponse.json({ error: "El envío todavía no está configurado" }, { status: 503 });
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
    return NextResponse.json({ error: "No se pudo mandar: probá de nuevo en un rato" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
