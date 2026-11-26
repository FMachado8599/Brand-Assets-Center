import type { SupabaseClient } from "@supabase/supabase-js";
import type { Slack } from "@/lib/integraciones/slack";

export type Vinculo = { vinculadas: number; sinSlack: string[] };

/**
 * Cruza la gente del Slack con el equipo del Board por el mail (todos usan el de @camaratbwa.com en
 * los dos lados) y lo guarda en slack_personas. Lo corre un admin: al conectar Slack y con el botón
 * "Volver a cruzar" (por si entró gente nueva). Quien ya no aparece en Slack se desvincula.
 */
export async function vincularPersonas(db: SupabaseClient, slack: Slack): Promise<Vinculo> {
  const [usuarios, equipoRes] = await Promise.all([
    slack.usuarios(),
    db.from("equipo").select("id, nombre, email, activo").not("email", "is", null),
  ]);
  if (equipoRes.error) throw new Error(equipoRes.error.message);
  const porMail = new Map(usuarios.filter((u) => u.email).map((u) => [u.email!, u]));
  const equipo = (equipoRes.data ?? []) as { id: string; nombre: string; email: string; activo: boolean }[];

  const filas = equipo
    .map((e) => ({ e, u: porMail.get(e.email.toLowerCase()) }))
    .filter((x): x is { e: (typeof equipo)[number]; u: NonNullable<typeof x.u> } => Boolean(x.u))
    .map(({ e, u }) => ({ persona_id: e.id, slack_id: u.id, slack_nombre: u.nombre, vinculado: new Date().toISOString() }));

  // Primero se sacan los que cambiaron o ya no están (slack_id es único: un usuario de Slack, una persona).
  const ids = new Set(filas.map((f) => f.persona_id));
  const { data: actuales, error } = await db.from("slack_personas").select("persona_id, slack_id");
  if (error) throw new Error(error.message);
  const sacar = ((actuales ?? []) as { persona_id: string; slack_id: string }[])
    .filter((a) => !ids.has(a.persona_id) || filas.find((f) => f.persona_id === a.persona_id)?.slack_id !== a.slack_id)
    .map((a) => a.persona_id);
  if (sacar.length) {
    const r = await db.from("slack_personas").delete().in("persona_id", sacar);
    if (r.error) throw new Error(r.error.message);
  }
  if (filas.length) {
    const r = await db.from("slack_personas").upsert(filas, { onConflict: "persona_id" });
    if (r.error) throw new Error(r.error.message);
  }
  return {
    vinculadas: filas.length,
    sinSlack: equipo.filter((e) => e.activo && !ids.has(e.id)).map((e) => e.nombre).sort((a, b) => a.localeCompare(b)),
  };
}
