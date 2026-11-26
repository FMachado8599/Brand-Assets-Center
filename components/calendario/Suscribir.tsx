"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm";
import { copyPlain } from "@/lib/cards/clipboard";
import { supabase } from "@/lib/supabase";

/**
 * El link personal para ver el calendario en Google Calendar, Outlook o el celular: las entregas
 * propias y los cumpleaños del estudio. Se crea la primera vez que se abre; se puede cambiar por uno
 * nuevo (el anterior deja de andar).
 */
export function Suscribir({ open, onClose }: { open: boolean; onClose: () => void }) {
  const confirmar = useConfirm();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [renovando, setRenovando] = useState(false);

  const pedir = async (renovar: boolean) => {
    const { data, error: e } = await supabase.rpc("agenda_mi_link", { p_renovar: renovar });
    if (e) {
      setError(/agenda_mi_link|does not exist|schema cache/i.test(e.message) ? "Falta correr supabase/migracion-calendario.sql en Supabase." : e.message);
      return;
    }
    setError(null);
    setToken(data as string);
  };

  useEffect(() => {
    if (open && !token) pedir(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const url = token ? `${window.location.origin}/api/calendario/ics/${token}` : "";
  const webcal = url.replace(/^https?:\/\//, "webcal://");
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;

  const copiar = async () => {
    const ok = await copyPlain(url);
    setCopiado(ok);
    toast(ok ? "Link copiado" : "No se pudo copiar", ok ? "ok" : "error");
  };

  const renovar = async () => {
    const ok = await confirmar({
      title: "¿Cambiar el link?",
      description: "El anterior deja de andar: donde lo hayas agregado (Google, Outlook, el celular) vas a tener que agregar el nuevo.",
      confirmLabel: "Cambiarlo",
    });
    if (!ok) return;
    setRenovando(true);
    await pedir(true);
    setRenovando(false);
    setCopiado(false);
    toast("Link nuevo listo");
  };

  const paso = "flex gap-2 text-sm";
  const num = "grid h-5 w-5 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle>Verlo en tu calendario</DialogTitle>
          <DialogDescription>
            Tus entregas y los cumpleaños del estudio, en Google Calendar, Outlook o el calendario del celular. Se actualiza solo (Google tarda unas horas en traer lo nuevo).
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="rounded-2xl bg-primary/20 p-3 text-sm">{error}</p>
        ) : !token ? (
          <div className="skeleton h-28 rounded-2xl" />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-md border bg-secondary/50 px-3 font-mono text-[11px]" aria-label="Tu link" />
              <button
                type="button"
                onClick={copiar}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-95"
              >
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copiar
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Es personal: quien tenga el link ve tus entregas. No lo compartas.</p>

            <div className="space-y-3 rounded-2xl border p-3">
              <p className="eyebrow">Google Calendar</p>
              <a href={google} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-full border bg-card px-3.5 text-[13px] font-medium shadow-sm hover:border-foreground/30">
                Agregar a Google Calendar
              </a>
              <p className="text-xs text-muted-foreground">
                O a mano: en Google Calendar, <span className="text-foreground">Otros calendarios → + → Desde URL</span> y pegá el link.
              </p>
            </div>

            <div className="space-y-2 rounded-2xl border p-3">
              <p className="eyebrow">Outlook</p>
              <p className={paso}>
                <span className={num}>1</span>
                <span>
                  <span className="text-foreground">Outlook nuevo o en la web:</span> Calendario → Agregar calendario → <span className="text-foreground">Suscribirse desde la web</span> y pegá el link.
                </span>
              </p>
              <p className={paso}>
                <span className={num}>2</span>
                <span>
                  <span className="text-foreground">Outlook clásico:</span> Archivo → Configuración de la cuenta → Calendarios de Internet → Nuevo, y pegá el link.
                </span>
              </p>
              <a href={webcal} className="inline-flex h-9 items-center rounded-full border bg-card px-3.5 text-[13px] font-medium shadow-sm hover:border-foreground/30">
                Abrir en la app de calendario de la compu
              </a>
            </div>

            <button
              type="button"
              onClick={renovar}
              disabled={renovando}
              className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            >
              {renovando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Cambiar el link (el anterior deja de andar)
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
