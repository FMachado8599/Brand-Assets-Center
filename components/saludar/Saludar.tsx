"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Copy, ImagePlay, Shuffle, Slack as SlackIcon } from "lucide-react";
import { ContextBar } from "@/components/shell/ContextBar";
import { FotoPerfil } from "@/components/perfil/piezas";
import { toast } from "@/components/ui/toaster";
import { useEquipo } from "@/hooks/useEquipo";
import { linkPrivado, useSlack } from "@/hooks/useSlack";
import { copyPlain } from "@/lib/cards/clipboard";
import { cuandoCumple, cumpleDe, cumpleHoy, textoCumple } from "@/lib/cumple";
import { hoyISO, nombreDe } from "@/lib/perfil";
import { supabase } from "@/lib/supabase";

/** Para arrancar: se elige uno al azar y se puede cambiar o escribir otro. */
const SALUDOS = [
  "¡Feliz cumple, {n}! 🎂 Que tengas un día buenísimo.",
  "¡Feliz cumpleaños, {n}! 🎉 Que lo disfrutes mucho.",
  "{n}, ¡feliz cumple! 🥳 Que este año venga con todo.",
  "¡Muy feliz cumple, {n}! 🎈 Un abrazo grande.",
  "¡Felicidades, {n}! 🎂 Que la pases increíble hoy.",
  "¡Feliz cumple, {n}! 🍰 Hoy se festeja (y mañana también).",
];

/**
 * El link del aviso de cumpleaños: quién cumple, un saludo para copiar y el botón que abre su privado
 * en Slack. El saludo lo manda cada uno desde su cuenta: el bot no saluda en nombre de nadie.
 */
export function Saludar() {
  const params = useSearchParams();
  const id = params.get("a");
  const equipo = useEquipo();
  const slack = useSlack();
  const persona = equipo.data?.personas.find((p) => p.id === id) ?? null;
  const nombre = persona ? nombreDe(persona.perfil, persona.nombre) : "";
  const primer = nombre.split(" ")[0] || nombre;
  const [i, setI] = useState(() => Math.floor(Math.random() * SALUDOS.length));
  const [texto, setTexto] = useState("");

  useEffect(() => {
    if (primer) setTexto(SALUDOS[i].replace("{n}", primer));
  }, [i, primer]);

  const slackId = useMemo(() => slack.data?.vinculos?.find((v) => v.persona_id === id)?.slack_id ?? null, [slack.data, id]);
  // Los vínculos completos los ven los admins; para el resto se buscan en la tabla (el estudio la lee).
  const [slackIdDe, setSlackIdDe] = useState<string | null>(null);
  useEffect(() => {
    if (!id || slackId) return;
    supabase
      .from("slack_personas")
      .select("slack_id")
      .eq("persona_id", id)
      .maybeSingle()
      .then(({ data }) => setSlackIdDe((data?.slack_id as string | undefined) ?? null));
  }, [id, slackId]);
  const destino = slackId ?? slackIdDe;
  const abrir = destino ? linkPrivado(slack.data?.conexion?.team_id, destino) : null;

  const copiarYAbrir = async () => {
    const ok = await copyPlain(texto);
    toast(ok ? "Saludo copiado: pegalo en el chat" : "No se pudo copiar", ok ? "ok" : "error");
    if (abrir) window.location.href = abrir;
  };

  const c = cumpleDe(persona);
  const hoy = hoyISO();

  return (
    <>
      <ContextBar>
        <span className="px-2 text-sm font-semibold tracking-tight text-cream">Saludar</span>
      </ContextBar>
      <main className="mx-auto max-w-md px-4 pb-20 pt-28 text-center">
        {!equipo.loaded ? (
          <div className="skeleton mx-auto h-72 rounded-[1.75rem]" />
        ) : !persona ? (
          <>
            <p className="eyebrow">Saludar</p>
            <h1 className="mt-3 font-display text-4xl">No encontramos a esa persona</h1>
            <p className="mt-2 text-sm text-muted-foreground">Puede que el link esté incompleto.</p>
          </>
        ) : (
          <section className="rounded-[1.75rem] border bg-card p-6 shadow-sm">
            <FotoPerfil nombre={nombre} url={persona.avatar_url} acento={persona.perfil?.acento ?? null} size={96} className="mx-auto" />
            <p className="eyebrow mt-4">{c && cumpleHoy(c, hoy) ? "Hoy cumple" : c ? `Cumple ${cuandoCumple(c, hoy).toLowerCase()}` : "Saludar a"}</p>
            <h1 className="mt-1 font-display text-4xl leading-none">{nombre} 🎂</h1>
            {c && <p className="mt-1 text-sm text-muted-foreground">{textoCumple(c)}</p>}

            <div className="mt-5 text-left">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="eyebrow">Tu saludo</span>
                <button
                  type="button"
                  onClick={() => setI((x) => (x + 1) % SALUDOS.length)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <Shuffle className="h-3.5 w-3.5" /> Otro
                </button>
              </div>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-2xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground/40"
              />
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={copiarYAbrir}
                disabled={!texto.trim()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-95 disabled:opacity-50"
              >
                {abrir ? <SlackIcon className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {abrir ? `Copiar y abrir el chat con ${primer}` : "Copiar el saludo"}
              </button>
              <Link
                href="/library/gifs"
                target="_blank"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border bg-card px-4 text-sm font-medium hover:border-foreground/30"
              >
                <ImagePlay className="h-4 w-4" /> Sumarle un GIF <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {abrir
                ? "Se abre su privado en la app de Slack con el saludo copiado: pegalo y mandalo."
                : slack.conectado
                  ? `${primer} no está vinculado en Slack: copiá el saludo y mandáselo por donde quieras.`
                  : "Copiá el saludo y mandáselo por donde quieras."}
            </p>
          </section>
        )}
      </main>
    </>
  );
}
