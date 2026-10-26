"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cambiarEquipo } from "@/hooks/useEquipo";
import { equipoRepo, type EquipoData, type Persona } from "@/lib/board/equipo";
import { fold } from "@/lib/redaccion/text";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * De qué marcas es designada una persona, en cada sector de sus puestos: "Facu es el diseñador de
 * Changan, Leapmotor y Amstel". Cada marca tiene un solo designado por sector; si ya tiene otro,
 * un admin se la puede pasar.
 */
export function MarcasDialog({
  persona,
  data,
  marcas,
  editable,
  admin,
  onClose,
}: {
  persona: Persona | null;
  data: EquipoData;
  marcas: Brand[];
  editable: boolean;
  admin: boolean;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const [buscar, setBuscar] = useState("");
  const [soloElegidas, setSoloElegidas] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);

  // Los sectores de sus puestos, en el orden de siempre.
  const sectores = useMemo(() => {
    if (!persona) return [];
    const ids = new Set(persona.puestos.flatMap((id) => data.puestos.find((p) => p.id === id)?.sectores ?? []));
    return data.sectores.filter((s) => ids.has(s.id));
  }, [persona, data]);

  const [sector, setSector] = useState<string | null>(null);
  useEffect(() => {
    setSector(sectores[0]?.id ?? null);
    setBuscar("");
    setSoloElegidas(false);
  }, [persona?.id, sectores]);

  const nombreDe = useMemo(() => new Map(data.personas.map((p) => [p.id, p.nombre])), [data.personas]);
  const designadoDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of data.designaciones) if (d.sector_id === sector) m.set(d.brand_id, d.persona_id);
    return m;
  }, [data.designaciones, sector]);

  const lista = useMemo(() => {
    const q = fold(buscar).trim();
    return marcas
      .filter((m) => !q || fold(m.name).includes(q))
      .filter((m) => !soloElegidas || designadoDe.get(m.id) === persona?.id)
      .sort((a, b) => Number(designadoDe.get(b.id) === persona?.id) - Number(designadoDe.get(a.id) === persona?.id) || a.name.localeCompare(b.name, "es"));
  }, [marcas, buscar, soloElegidas, designadoDe, persona?.id]);

  const cuantas = (sectorId: string) => data.designaciones.filter((d) => d.persona_id === persona?.id && d.sector_id === sectorId).length;

  async function alternar(marca: Brand) {
    if (!persona || !sector || !editable) return;
    const actual = designadoDe.get(marca.id);
    const nombreSector = data.sectores.find((s) => s.id === sector)?.nombre ?? sector;
    if (actual === persona.id) {
      setGuardando(marca.id);
      await cambiarEquipo(() => equipoRepo.quitarDesignacion(marca.id, sector, persona.id));
      setGuardando(null);
      return;
    }
    if (actual) {
      if (!admin) return;
      const ok = await confirm({
        title: `¿Pasarle ${marca.name} a ${persona.nombre}?`,
        description: `En ${nombreSector}, ${marca.name} hoy es de ${nombreDe.get(actual) ?? "otra persona"}. Va a quedar como designado ${persona.nombre}.`,
        confirmLabel: "Pasársela",
      });
      if (!ok) return;
    }
    setGuardando(marca.id);
    await cambiarEquipo(() => equipoRepo.designar(marca.id, sector, persona.id));
    setGuardando(null);
  }

  return (
    <Dialog open={Boolean(persona)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Marcas de {persona?.nombre}</DialogTitle>
          <DialogDescription>
            Las marcas de las que es designado: sus tareas son prioridad suya, aunque cualquiera del sector las puede tomar.
          </DialogDescription>
        </DialogHeader>

        {!sectores.length ? (
          <p className="rounded-xl bg-primary/20 p-3 text-sm">Primero necesita un puesto: las marcas se eligen por sector.</p>
        ) : (
          <>
            {sectores.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {sectores.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSector(s.id)}
                    className={cn(
                      "h-8 rounded-full border px-3 text-[13px] font-medium",
                      sector === s.id ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/30"
                    )}
                  >
                    {s.nombre} <span className="tabular-nums opacity-60">{cuantas(s.id)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="flex h-9 flex-1 items-center gap-2 rounded-full border bg-card px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Buscar una marca"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => setSoloElegidas((v) => !v)}
                aria-pressed={soloElegidas}
                className={cn("h-9 rounded-full border px-3 text-[13px] font-medium", soloElegidas && "border-foreground bg-foreground text-background")}
              >
                Solo las suyas
              </button>
            </div>
            <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto">
              {lista.map((m) => {
                const actual = designadoDe.get(m.id);
                const mia = actual === persona?.id;
                const deOtro = actual && !mia;
                const bloqueada = !editable || (deOtro && !admin);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={bloqueada || guardando === m.id}
                      onClick={() => alternar(m)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors",
                        !bloqueada && "hover:bg-secondary",
                        bloqueada && "cursor-default"
                      )}
                    >
                      <ClientMark brand={m} className="h-8 w-8 rounded-lg text-[10px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.name}</span>
                        {deOtro && <span className="block truncate text-xs text-muted-foreground">Designado: {nombreDe.get(actual!) ?? "otra persona"}</span>}
                      </span>
                      <span
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                          mia ? "border-foreground bg-foreground text-background" : "border-input bg-card",
                          bloqueada && !mia && "opacity-40"
                        )}
                      >
                        {guardando === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : mia ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
              {!lista.length && <li className="p-6 text-center text-sm text-muted-foreground">No hay marcas que coincidan.</li>}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
