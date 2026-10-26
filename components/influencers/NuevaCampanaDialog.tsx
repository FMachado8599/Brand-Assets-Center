"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { useClients } from "@/hooks/useClients";
import { pedirInfluencity, refreshInfluencers } from "@/hooks/useInfluencers";
import { refreshInfluencity, useInfluencity } from "@/hooks/useInfluencity";
import { ElegirPerfiles } from "./ElegirPerfiles";

const NINGUNO = "__ninguno";
const hoyUtc = () => new Date().toISOString().slice(0, 10);
const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** "a, #b  c" → ["a", "b", "c"] (sin # ni @, hasta 5). */
const partes = (texto: string, prefijo: RegExp) =>
  [...new Set(texto.split(/[\s,;]+/).map((t) => t.replace(prefijo, "").trim()).filter(Boolean))].slice(0, 5);

/**
 * Crear una campaña en Influencity: mide lo que se publique con ciertas menciones, hashtags o
 * palabras entre dos fechas (de los influencers elegidos o de cualquiera). Queda con su cliente.
 */
export function NuevaCampanaDialog({ open, onOpenChange, cliente }: { open: boolean; onOpenChange: (open: boolean) => void; cliente?: string | null }) {
  const { clients } = useClients();
  const { cuotas } = useInfluencity();
  const [brand, setBrand] = useState<string>(NINGUNO);
  const [nombre, setNombre] = useState("");
  const [inicio, setInicio] = useState(hoyUtc);
  const [fin, setFin] = useState(() => enDias(30));
  const [menciones, setMenciones] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [keywords, setKeywords] = useState("");
  const [perfiles, setPerfiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Lo que se completó solo al elegir el cliente (si se edita a mano, no se vuelve a pisar).
  const auto = useRef({ nombre: "", menciones: "" });

  const elegir = (id: string) => {
    setBrand(id);
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    const mes = new Date(`${inicio}T12:00:00Z`).toLocaleDateString("es-UY", { month: "long", year: "numeric" });
    const n = `${c.name} · ${mes}`;
    const m = (c.socials ?? []).filter((s) => s.network === "instagram" || s.network === "tiktok").map((s) => `@${s.handle}`).join(" ");
    setNombre((v) => (!v || v === auto.current.nombre ? n : v));
    setMenciones((v) => (!v || v === auto.current.menciones ? m : v));
    auto.current = { nombre: n, menciones: m };
  };

  useEffect(() => {
    if (!open) return;
    auto.current = { nombre: "", menciones: "" };
    setNombre("");
    setMenciones("");
    setHashtags("");
    setKeywords("");
    setPerfiles([]);
    setInicio(hoyUtc());
    setFin(enDias(30));
    setBrand(NINGUNO);
    if (cliente) elegir(cliente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cliente]);

  const filtros = useMemo(
    () => ({ menciones: partes(menciones, /^@+/), hashtags: partes(hashtags, /^#+/), keywords: partes(keywords, /^$/) }),
    [menciones, hashtags, keywords]
  );
  const sinFiltros = !filtros.menciones.length && !filtros.hashtags.length && !filtros.keywords.length;
  const lugares = cuotas?.tracking?.restantes;
  const listo = nombre.trim() && inicio && fin && fin >= inicio && !sinFiltros && !busy;

  const crear = async () => {
    if (!listo) return;
    setBusy(true);
    try {
      await pedirInfluencity("/trackings", {
        tipo: "custom",
        nombre,
        inicio,
        fin,
        ...filtros,
        perfiles,
        brand_id: brand === NINGUNO ? null : brand,
      });
      await refreshInfluencers();
      refreshInfluencity();
      toast("Campaña creada en Influencity");
      onOpenChange(false);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva campaña</DialogTitle>
          <DialogDescription>
            Influencity mide todo lo que se publique con estas menciones, hashtags o palabras entre las dos fechas. Si elegís influencers, solo lo de ellos.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            crear();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="camp-cliente">Cliente</Label>
              <Select value={brand} onValueChange={(v) => (v === NINGUNO ? setBrand(v) : elegir(v))}>
                <SelectTrigger id="camp-cliente" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NINGUNO}>Sin cliente</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="camp-nombre">Nombre</Label>
              <Input id="camp-nombre" className="mt-1.5" value={nombre} maxLength={120} placeholder="Ej: UTE · Día de la Madre" onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="camp-inicio">Desde</Label>
              <Input id="camp-inicio" type="date" className="mt-1.5" value={inicio} min={hoyUtc()} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="camp-fin">Hasta</Label>
              <Input id="camp-fin" type="date" className="mt-1.5" value={fin} min={inicio} onChange={(e) => setFin(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="camp-menciones">Menciones</Label>
              <Input id="camp-menciones" className="mt-1.5" value={menciones} placeholder="@cuenta" onChange={(e) => setMenciones(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="camp-hashtags">Hashtags</Label>
              <Input id="camp-hashtags" className="mt-1.5" value={hashtags} placeholder="#campaña" onChange={(e) => setHashtags(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="camp-palabras">Palabras clave</Label>
              <Input id="camp-palabras" className="mt-1.5" value={keywords} placeholder="sorteo" onChange={(e) => setKeywords(e.target.value)} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Hasta 5 de cada una, separadas por espacio o coma. {sinFiltros && <span className="font-medium text-foreground">Hace falta al menos una.</span>}
          </p>

          <div>
            <Label>Influencers (opcional)</Label>
            <ElegirPerfiles className="mt-1.5" elegidos={perfiles} onChange={setPerfiles} cliente={brand === NINGUNO ? null : brand} />
            {lugares != null && (
              <p className={lugares < perfiles.length ? "mt-1.5 text-xs font-medium text-destructive" : "mt-1.5 text-xs text-muted-foreground"}>
                Quedan {lugares} lugares para perfiles en las campañas del plan.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!listo}>
              {busy ? <Loader2 className="animate-spin" /> : <Megaphone />}
              Crear en Influencity
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
