"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { useSlack } from "@/hooks/useSlack";
import { supabase } from "@/lib/supabase";

type Prefs = { menciones: boolean; resumen: boolean; cumples: boolean };

/** Sin fila: lo de siempre (igual que en la base). */
const DEFECTO: Prefs = { menciones: false, resumen: false, cumples: true };

const OPCIONES: { id: keyof Prefs; titulo: string; detalle: string }[] = [
  { id: "menciones", titulo: "Cuando te nombran o te pasan una tarea", detalle: "Al instante, en Basecamp o en la app (las mismas que marca la campanita como más importantes)." },
  { id: "resumen", titulo: "Tu resumen de la mañana", detalle: "De lunes a viernes, tipo 8: lo tuyo que vence hoy o mañana y lo vencido. Si no hay nada, no llega." },
  { id: "cumples", titulo: "Cumpleaños de tus compañeros", detalle: "El día que cumple alguien de tu hub o de tus marcas, con el link para saludarlo." },
];

/** Perfil → Avisos por Slack: qué le llega a cada uno por privado. */
export function SlackPrefs({ equipoId }: { equipoId: string }) {
  const slack = useSlack();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [falta, setFalta] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase
      .from("slack_prefs")
      .select("menciones, resumen, cumples")
      .eq("persona_id", equipoId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          setFalta(/slack_prefs|schema cache|does not exist|42P01/i.test(error.message));
          setPrefs(DEFECTO);
        } else setPrefs((data as Prefs | null) ?? DEFECTO);
      });
    return () => {
      vivo = false;
    };
  }, [equipoId]);

  const cambiar = async (id: keyof Prefs, valor: boolean) => {
    if (!prefs) return;
    const nuevas = { ...prefs, [id]: valor };
    setPrefs(nuevas);
    const { error } = await supabase.from("slack_prefs").upsert({ persona_id: equipoId, ...nuevas, updated_at: new Date().toISOString() });
    if (error) {
      setPrefs(prefs);
      toast(`No se pudo guardar: ${error.message}`, "error");
    }
  };

  if (falta) return <p className="text-sm text-muted-foreground">Falta correr supabase/migracion-slack.sql en Supabase.</p>;
  if (!prefs || !slack.loaded) return <div className="skeleton h-32 rounded-2xl" />;

  const conectado = slack.conectado;
  const vinculado = slack.data?.yo.slack_id;

  return (
    <div className="space-y-4">
      {!conectado ? (
        <p className="rounded-2xl bg-secondary/70 px-3 py-2 text-[13px] text-muted-foreground">
          Slack todavía no está conectado (lo conecta un admin en Board → Slack). Lo que elijas acá queda guardado para cuando esté.
        </p>
      ) : vinculado ? (
        <p className="text-[13px] text-muted-foreground">
          Te llegan como <span className="font-medium text-foreground">@{slack.data?.yo.slack_nombre ?? "vos"}</span>, por privado del bot Herramientas.
        </p>
      ) : (
        <p className="rounded-2xl bg-primary/20 px-3 py-2 text-[13px]">
          No te encontramos en Slack: tu mail de Slack tiene que ser el mismo que el de acá. Si recién entraste, pedile a un admin que vuelva a cruzar la gente en Board → Slack.
        </p>
      )}
      <ul className="space-y-3">
        {OPCIONES.map((o) => (
          <li key={o.id} className="flex items-start gap-3">
            <Switch checked={prefs[o.id]} onCheckedChange={(v) => cambiar(o.id, v)} aria-label={o.titulo} className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{o.titulo}</p>
              <p className="text-xs text-muted-foreground">{o.detalle}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
