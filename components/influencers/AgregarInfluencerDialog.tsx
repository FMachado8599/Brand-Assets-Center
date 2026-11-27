"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { useClients } from "@/hooks/useClients";
import { pedirInfluencity, refreshInfluencers } from "@/hooks/useInfluencers";
import { refreshInfluencity, useInfluencity } from "@/hooks/useInfluencity";
import { nombreRed, REDES_CON_ANALISIS, REDES_INFLUENCITY, type RedInfluencity } from "@/lib/influencity/tipos";

const NINGUNO = "__ninguno";

/** Del link que se pegue, la red: así no hay que elegirla. */
function redDelLink(texto: string): RedInfluencity | null {
  const t = texto.toLowerCase();
  if (t.includes("instagram.com")) return "instagram";
  if (t.includes("tiktok.com")) return "tiktok";
  if (t.includes("youtube.com") || t.includes("youtu.be")) return "youtube";
  if (t.includes("twitter.com") || t.includes("x.com/")) return "twitter";
  if (t.includes("facebook.com")) return "facebook";
  if (t.includes("twitch.tv")) return "twitch";
  if (t.includes("pinterest.")) return "pinterest";
  return null;
}

/**
 * Sumar un influencer: queda en Influencity (si ya estaba, se usa ese) y acá, con su detalle.
 * Opcionalmente, el análisis de audiencia (gasta una cuota) y con qué cliente trabajó.
 */
export function AgregarInfluencerDialog({
  open,
  onOpenChange,
  cliente,
  onListo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** El cliente que viene elegido (ej: desde su ficha). */
  cliente?: string | null;
  onListo?: (perfilId: string) => void;
}) {
  const { clients } = useClients();
  const { cuotas } = useInfluencity();
  const [red, setRed] = useState<RedInfluencity>("instagram");
  const [usuario, setUsuario] = useState("");
  const [analizar, setAnalizar] = useState(false);
  const [brand, setBrand] = useState<string>(cliente ?? NINGUNO);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setUsuario("");
    setNota("");
    setAnalizar(false);
    setBrand(cliente ?? NINGUNO);
  }, [open, cliente]);

  const puedeAnalizar = REDES_CON_ANALISIS.includes(red);
  const quedan = cuotas?.analisis?.restantes;
  const sinCuota = quedan === 0;

  const enviar = async () => {
    if (!usuario.trim() || busy) return;
    setBusy(true);
    try {
      const r = await pedirInfluencity<{ perfil: string; yaEstaba: boolean }>("/perfiles", {
        red,
        usuario,
        analizar: puedeAnalizar && analizar,
        brand_id: brand === NINGUNO ? null : brand,
        nota,
      });
      await refreshInfluencers();
      if (analizar) refreshInfluencity();
      toast(r.yaEstaba ? "Ya estaba en Influencity: quedó acá con sus datos" : "Influencer agregado");
      onOpenChange(false);
      onListo?.(r.perfil);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          input.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Agregar influencer</DialogTitle>
          <DialogDescription>Queda en Influencity y acá, con seguidores y engagement. Si ya estaba en Influencity, se usa ese.</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2">
            <div>
              <Label htmlFor="inf-red">Red</Label>
              <Select value={red} onValueChange={(v) => setRed(v as RedInfluencity)}>
                <SelectTrigger id="inf-red" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REDES_INFLUENCITY.map((r) => (
                    <SelectItem key={r} value={r}>
                      {nombreRed(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="inf-usuario">Usuario o link</Label>
              <Input
                ref={input}
                id="inf-usuario"
                className="mt-1.5"
                value={usuario}
                placeholder="@usuario"
                autoComplete="off"
                onChange={(e) => {
                  setUsuario(e.target.value);
                  const deLink = redDelLink(e.target.value);
                  if (deLink) setRed(deLink);
                }}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="inf-cliente">Trabajó con</Label>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger id="inf-cliente" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUNO}>Ningún cliente por ahora</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {brand !== NINGUNO && (
              <Input className="mt-2" value={nota} maxLength={200} placeholder="Nota (opcional): campaña, canje, fee…" onChange={(e) => setNota(e.target.value)} />
            )}
          </div>

          <label className="flex items-start gap-3 rounded-xl bg-secondary/60 p-3 text-sm">
            <Switch checked={puedeAnalizar && analizar} onCheckedChange={setAnalizar} disabled={!puedeAnalizar || sinCuota} aria-label="Analizar la audiencia" className="mt-0.5" />
            <span>
              <span className="font-medium">Analizar la audiencia</span>
              <span className="block text-xs text-muted-foreground">
                {!puedeAnalizar
                  ? `Influencity no analiza audiencias de ${nombreRed(red)}.`
                  : sinCuota
                    ? "No quedan análisis en este período del plan."
                    : `Edad, género, países e intereses de sus seguidores. Gasta un análisis${quedan != null ? ` (quedan ${quedan})` : ""}.`}
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!usuario.trim() || busy}>
              {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
              Agregar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
