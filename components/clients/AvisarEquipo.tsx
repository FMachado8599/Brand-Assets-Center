"use client";

import { useEffect, useState } from "react";
import { Hash, Loader2, Megaphone, Send, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { pedirSlack, useSlack } from "@/hooks/useSlack";
import { supabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";

type Persona = { persona_id: string; nombre: string; slack_id: string | null };
type Destino = "canal" | "privado";

/**
 * Avisarle algo al equipo de una marca por Slack, desde su ficha en Clientes: en el canal de la marca o
 * en un privado en grupo con su gente (los designados, el hub y sus directores).
 */
export function AvisarEquipo({ brand, open, onClose }: { brand: Brand; open: boolean; onClose: () => void }) {
  const slack = useSlack();
  const [gente, setGente] = useState<Persona[] | null>(null);
  const [texto, setTexto] = useState("");
  const [destino, setDestino] = useState<Destino>("canal");
  const [enviando, setEnviando] = useState(false);
  const canal = slack.data?.canales.find((c) => c.brand_id === brand.id) ?? null;

  useEffect(() => {
    if (!open) return;
    setDestino(canal ? "canal" : "privado");
    supabase.rpc("marca_gente", { p_brand: brand.id }).then(({ data }) => setGente((data ?? []) as Persona[]));
  }, [open, brand.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const yo = slack.data?.yo.equipo_id;
  const otros = (gente ?? []).filter((p) => p.persona_id !== yo);
  const conSlack = otros.filter((p) => p.slack_id);

  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await pedirSlack<{ canal?: string; personas?: number; enGrupo?: boolean; sinSlack?: string[] }>("/api/slack/avisar", {
        body: { brand_id: brand.id, texto, destino },
      });
      toast(
        destino === "canal"
          ? `Enviado a #${r.canal}`
          : `Enviado ${r.enGrupo ? "en un grupo" : "por privado"} a ${r.personas} ${r.personas === 1 ? "persona" : "personas"}${r.sinSlack?.length ? ` (sin Slack: ${r.sinSlack.join(", ")})` : ""}`
      );
      setTexto("");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };

  const opcion = (d: Destino, icono: typeof Hash, titulo: string, detalle: string, deshabilitada?: boolean) => {
    const Icono = icono;
    return (
      <button
        type="button"
        onClick={() => setDestino(d)}
        disabled={deshabilitada}
        className={cn(
          "flex flex-1 items-start gap-2 rounded-2xl border p-3 text-left transition-colors disabled:opacity-50",
          destino === d ? "border-foreground bg-secondary/60" : "hover:border-foreground/30"
        )}
      >
        <Icono className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{titulo}</span>
          <span className="block text-xs text-muted-foreground">{detalle}</span>
        </span>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" /> Avisar al equipo de {brand.name}
          </DialogTitle>
          <DialogDescription>Sale por Slack, del bot Herramientas, con tu nombre.</DialogDescription>
        </DialogHeader>

        {!slack.loaded ? (
          <div className="skeleton h-24 rounded-2xl" />
        ) : !slack.conectado ? (
          <p className="rounded-2xl bg-secondary/70 p-3 text-sm text-muted-foreground">Slack todavía no está conectado: lo conecta un admin en Board → Slack.</p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              {opcion("canal", Hash, canal ? `#${canal.canal_nombre}` : "Canal de la marca", canal ? "Lo ve todo el canal." : "Todavía no tiene: lo crea un admin en Board → Slack.", !canal)}
              {opcion(
                "privado",
                Users,
                "Privado al equipo",
                gente === null
                  ? "Buscando al equipo…"
                  : conSlack.length
                    ? `${conSlack.length} ${conSlack.length === 1 ? "persona" : "personas"}${conSlack.length <= 7 ? ", en un grupo" : ", uno por uno"}`
                    : "Nadie del equipo está en Slack.",
                gente !== null && !conSlack.length
              )}
            </div>
            {destino === "privado" && otros.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {otros.map((p) => (p.slack_id ? p.nombre : `${p.nombre} (sin Slack)`)).join(" · ")}
              </p>
            )}
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Ej: El cliente adelantó la reunión al jueves a las 10."
              className="w-full resize-none rounded-2xl border bg-card px-3 py-2.5 text-sm outline-none focus:border-foreground/40"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && texto.trim()) enviar();
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter para enviar</span>
              <button
                type="button"
                onClick={enviar}
                disabled={!texto.trim() || enviando || (destino === "canal" && !canal) || (destino === "privado" && !conSlack.length)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-95 disabled:opacity-50"
              >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
