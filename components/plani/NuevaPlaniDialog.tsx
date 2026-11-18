"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { openNewClient } from "@/components/clients/newClient";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { useClients } from "@/hooks/useClients";
import { useIntegraciones } from "@/hooks/useIntegraciones";
import { mesDelTitulo, type TareaCompleta } from "@/lib/plani/basecamp";
import { MESES, TIPOS } from "@/lib/plani/config";
import { planiErrorMessage, planiRepo } from "@/lib/plani/repo";
import type { PlaniTipo } from "@/lib/plani/types";
import { fold } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { BasecampMark, TareaPicker } from "./BasecampTarea";
import { Segmented } from "./editor/fields";

/** El mes que viene: las planis se arman el mes anterior. */
function mesQueViene() {
  const d = new Date();
  return d.getMonth() === 11 ? { anio: d.getFullYear() + 1, mes: 1 } : { anio: d.getFullYear(), mes: d.getMonth() + 2 };
}

export type NuevaPlaniInicial = { brandId?: string | null; anio?: number; mes?: number; tarea?: TareaCompleta | null };

/**
 * Nueva plani: cliente, mes y tipo. Si Basecamp está conectado, se puede colgar de la tarea del
 * brief (y si se arranca desde una tarea, ya viene todo elegido).
 */
export function NuevaPlaniDialog({
  open,
  onOpenChange,
  inicial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  inicial?: NuevaPlaniInicial;
}) {
  const router = useRouter();
  const { clients } = useClients();
  const { hayBasecamp } = useIntegraciones();
  const base = mesQueViene();
  const [brandId, setBrandId] = useState<string | null>(null);
  const [anio, setAnio] = useState(base.anio);
  const [mes, setMes] = useState(base.mes);
  const [tipo, setTipo] = useState<PlaniTipo>("plani");
  const [tarea, setTarea] = useState<TareaCompleta | null>(null);
  const [eligiendoTarea, setEligiendoTarea] = useState(false);
  const [q, setQ] = useState("");
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBrandId(inicial?.brandId ?? null);
    const desdeTarea = inicial?.tarea ? mesDelTitulo(inicial.tarea.titulo) : null;
    setAnio(inicial?.anio ?? base.anio);
    setMes(inicial?.mes ?? desdeTarea ?? base.mes);
    setTipo("plani");
    setTarea(inicial?.tarea ?? null);
    setEligiendoTarea(false);
    setQ("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const f = fold(q.trim());
    return f ? clients.filter((c) => fold(c.name).includes(f)) : clients;
  }, [clients, q]);

  const brand = clients.find((c) => c.id === brandId) ?? null;
  const moverMes = (d: number) => {
    let m = mes + d;
    let a = anio;
    if (m < 1) {
      m = 12;
      a--;
    }
    if (m > 12) {
      m = 1;
      a++;
    }
    setMes(m);
    setAnio(a);
  };

  const crear = async () => {
    if (!brandId) return;
    setCreando(true);
    const { data, error } = await planiRepo.create({
      brand_id: brandId,
      anio,
      mes,
      tipo,
      titulo: `${TIPOS[tipo].label} ${MESES[mes - 1]} ${anio}`,
      bc_tarea_id: tarea?.id ?? null,
    });
    setCreando(false);
    if (error || !data) return toast(planiErrorMessage(error ?? { message: "No se pudo crear" }), "error");
    onOpenChange(false);
    router.push(`/planificacion/${data.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva planificación</DialogTitle>
          <DialogDescription>Elegí el cliente y el mes. Las piezas se agregan adentro.</DialogDescription>
        </DialogHeader>

        <div className="-mx-1 min-h-0 space-y-5 overflow-y-auto px-1">
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="eyebrow">Cliente</span>
              <button
                type="button"
                onClick={() => openNewClient({ onCreated: (b) => setBrandId(b.id) })}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> Nuevo cliente
              </button>
            </div>
            <label className="relative mb-2 flex items-center">
              <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Buscar entre ${clients.length} clientes…`}
                className="h-9 w-full rounded-xl border border-black/[0.08] bg-background/60 pl-8 pr-3 text-sm outline-none focus:border-foreground/25"
              />
            </label>
            <ul className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3">
              {lista.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setBrandId(c.id);
                      if (tarea && brandId !== c.id) setTarea(null);
                    }}
                    aria-pressed={c.id === brandId}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl border p-1.5 pr-2.5 text-left text-sm transition-colors",
                      c.id === brandId ? "border-foreground bg-foreground text-background" : "border-black/[0.06] bg-card hover:bg-secondary"
                    )}
                  >
                    <ClientMark brand={c} className="h-8 w-8 rounded-lg text-[10px]" pad="p-[14%]" />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    {c.id === brandId && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-wrap items-end gap-4">
            <div>
              <span className="eyebrow mb-2 block">Mes</span>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Mes anterior" onClick={() => moverMes(-1)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[9.5rem] text-center font-display text-3xl leading-none">
                  {MESES[mes - 1]} <span className="text-muted-foreground">{anio}</span>
                </span>
                <button type="button" aria-label="Mes siguiente" onClick={() => moverMes(1)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div>
              <span className="eyebrow mb-2 block">Tipo</span>
              <Segmented<PlaniTipo> value={tipo} onChange={(v) => setTipo(v)} options={(Object.keys(TIPOS) as PlaniTipo[]).map((t) => ({ value: t, label: TIPOS[t].label, title: TIPOS[t].hint }))} />
            </div>
          </section>

          {hayBasecamp && brandId && (
            <section>
              <span className="eyebrow mb-2 block">Tarea de Basecamp</span>
              {tarea && !eligiendoTarea ? (
                <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-card px-3 py-2 text-sm">
                  <BasecampMark />
                  <span className="min-w-0 flex-1 truncate font-medium">{tarea.titulo}</span>
                  <button type="button" onClick={() => setEligiendoTarea(true)} className="text-xs text-muted-foreground hover:text-foreground">
                    Cambiar
                  </button>
                  <button type="button" onClick={() => setTarea(null)} className="text-xs text-muted-foreground hover:text-foreground">
                    Sacar
                  </button>
                </div>
              ) : eligiendoTarea ? (
                <TareaPicker
                  brandId={brandId}
                  mes={mes}
                  onPick={(t) => {
                    setTarea(t);
                    setEligiendoTarea(false);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEligiendoTarea(true)}
                  className="flex w-full items-center gap-2 rounded-xl border border-dashed border-foreground/20 px-3 py-2.5 text-left text-sm text-muted-foreground hover:border-foreground/35 hover:text-foreground"
                >
                  <BasecampMark /> Vincular la tarea del brief (opcional)
                </button>
              )}
            </section>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-black/[0.06] pt-4">
          {brand && (
            <span className="mr-auto truncate text-sm text-muted-foreground">
              {TIPOS[tipo].label} de <b className="font-semibold text-foreground">{brand.name}</b> · {MESES[mes - 1]} {anio}
            </span>
          )}
          <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-full px-4 text-sm font-medium hover:bg-secondary">
            Cancelar
          </button>
          <button
            type="button"
            onClick={crear}
            disabled={!brandId || creando}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 disabled:opacity-45"
          >
            {creando && <Loader2 className="h-4 w-4 animate-spin" />} Crear plani
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
