"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, Trash2 } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cambiarEquipo } from "@/hooks/useEquipo";
import { equipoRepo, type EquipoData, type Hub } from "@/lib/board/equipo";
import { fold } from "@/lib/redaccion/text";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar } from "../comun";
import { SelectSimple } from "./piezas";

/**
 * Hubs: grupos de marcas con su director (ej: Digital dividido en el hub de Gala y el de Julio).
 * Quién lo integra se elige en cada persona (pestaña Personas).
 */
export function HubsPanel({ data, marcas, admin }: { data: EquipoData; marcas: Brand[]; admin: boolean }) {
  const confirm = useConfirm();
  const [nuevo, setNuevo] = useState("");
  const [marcasDe, setMarcasDe] = useState<Hub | null>(null);
  const marcaPorId = useMemo(() => new Map(marcas.map((m) => [m.id, m])), [marcas]);

  // Para líder se ofrecen primero los de dirección.
  const lideres = useMemo(() => {
    const direccion = new Set(data.puestos.filter((p) => p.nivel === "direccion").map((p) => p.id));
    return data.personas
      .filter((p) => p.activo)
      .sort((a, b) => Number(b.puestos.some((id) => direccion.has(id))) - Number(a.puestos.some((id) => direccion.has(id))) || a.nombre.localeCompare(b.nombre, "es"))
      .map((p) => ({ value: p.id, label: p.nombre }));
  }, [data]);

  async function crear() {
    if (!nuevo.trim()) return;
    if (await cambiarEquipo(() => equipoRepo.crearHub(nuevo), `Hub "${nuevo.trim()}" creado`)) setNuevo("");
  }

  async function borrar(hub: Hub) {
    const ok = await confirm({
      title: `¿Borrar el hub ${hub.nombre}?`,
      description: "Sus marcas y su gente quedan sin hub. No se borra nada más.",
      confirmLabel: "Borrar",
      destructive: true,
    });
    if (ok) await cambiarEquipo(() => equipoRepo.borrarHub(hub.id), "Hub borrado");
  }

  return (
    <div className="space-y-3">
      {admin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crear();
          }}
          className="flex items-center gap-2 rounded-2xl border bg-card p-2"
        >
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Nombre del hub nuevo (ej: Hub Gala)"
            className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
          />
          <button type="submit" disabled={!nuevo.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-40">
            <Plus className="h-4 w-4" /> Crear hub
          </button>
        </form>
      )}

      {!data.hubs.length && (
        <p className="rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Todavía no hay hubs. Un hub agrupa marcas bajo un director (ej: Digital dividido en dos).
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {data.hubs.map((hub) => {
          const gente = data.personas.filter((p) => p.hub_id === hub.id);
          return (
            <section key={hub.id} className="rounded-3xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                {admin ? (
                  <input
                    defaultValue={hub.nombre}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== hub.nombre) cambiarEquipo(() => equipoRepo.actualizarHub(hub.id, { nombre: v }));
                    }}
                    className="h-9 min-w-0 flex-1 rounded-lg bg-transparent px-1 font-display text-2xl leading-none outline-none hover:bg-secondary/60 focus:bg-secondary/60"
                  />
                ) : (
                  <h3 className="flex-1 font-display text-2xl leading-none">{hub.nombre}</h3>
                )}
                {admin && (
                  <button type="button" onClick={() => borrar(hub)} aria-label={`Borrar ${hub.nombre}`} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="eyebrow mb-1 text-muted-foreground">Director</dt>
                  <dd>
                    {admin ? (
                      <SelectSimple
                        value={hub.lider_id}
                        onChange={(v) => cambiarEquipo(() => equipoRepo.actualizarHub(hub.id, { lider_id: v }))}
                        opciones={lideres}
                        ninguno="Sin director"
                      />
                    ) : (
                      <span className="font-medium">{data.personas.find((p) => p.id === hub.lider_id)?.nombre ?? "Sin director"}</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow mb-1 flex items-center gap-2 text-muted-foreground">
                    Marcas · {hub.marcas.length}
                    {admin && (
                      <button type="button" onClick={() => setMarcasDe(hub)} className="normal-case tracking-normal text-foreground underline-offset-2 hover:underline">
                        Elegir
                      </button>
                    )}
                  </dt>
                  <dd className="flex flex-wrap gap-1">
                    {hub.marcas.map((id) => marcaPorId.get(id)).filter(Boolean).map((m) => (
                      <span key={m!.id} className="inline-flex items-center gap-1.5 rounded-full bg-secondary py-0.5 pl-0.5 pr-2 text-xs font-medium">
                        <ClientMark brand={m!} className="h-5 w-5 rounded-full text-[8px]" />
                        {m!.name}
                      </span>
                    ))}
                    {!hub.marcas.length && <span className="text-xs text-muted-foreground">Ninguna todavía</span>}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow mb-1 text-muted-foreground">Gente · {gente.length}</dt>
                  <dd className="flex flex-wrap gap-1">
                    {gente.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-secondary py-0.5 pl-0.5 pr-2 text-xs font-medium">
                        <Avatar nombre={p.nombre} url={p.avatar_url} className="h-5 w-5 text-[8px]" />
                        {p.nombre}
                      </span>
                    ))}
                    {!gente.length && <span className="text-xs text-muted-foreground">Se elige en cada persona, en la pestaña Personas.</span>}
                  </dd>
                </div>
              </dl>
            </section>
          );
        })}
      </div>

      <MarcasHubDialog hub={marcasDe} data={data} marcas={marcas} onClose={() => setMarcasDe(null)} />
    </div>
  );
}

function MarcasHubDialog({ hub, data, marcas, onClose }: { hub: Hub | null; data: EquipoData; marcas: Brand[]; onClose: () => void }) {
  const [buscar, setBuscar] = useState("");
  const hubDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of data.hubs) for (const id of h.marcas) m.set(id, h.id);
    return m;
  }, [data.hubs]);
  const nombreHub = useMemo(() => new Map(data.hubs.map((h) => [h.id, h.nombre])), [data.hubs]);
  // El hub viene del momento en que se abrió: sus marcas al día salen de data.
  const actual = data.hubs.find((h) => h.id === hub?.id) ?? hub;
  const lista = useMemo(() => {
    const q = fold(buscar).trim();
    return marcas.filter((m) => !q || fold(m.name).includes(q)).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [marcas, buscar]);

  return (
    <Dialog open={Boolean(hub)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Marcas de {actual?.nombre}</DialogTitle>
          <DialogDescription>Cada marca está en un solo hub: si elegís una de otro, se pasa a este.</DialogDescription>
        </DialogHeader>
        <label className="flex h-9 items-center gap-2 rounded-full border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar una marca" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto">
          {actual &&
            lista.map((m) => {
              const en = hubDe.get(m.id);
              const elegida = en === actual.id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() =>
                      cambiarEquipo(() =>
                        equipoRepo.ponerMarcasHub(actual.id, actual.marcas, elegida ? actual.marcas.filter((id) => id !== m.id) : [...actual.marcas, m.id])
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-secondary"
                  >
                    <ClientMark brand={m} className="h-8 w-8 rounded-lg text-[10px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.name}</span>
                      {en && !elegida && <span className="block truncate text-xs text-muted-foreground">En {nombreHub.get(en)}</span>}
                    </span>
                    <span className={cn("grid h-5 w-5 place-items-center rounded-md border", elegida ? "border-foreground bg-foreground text-background" : "border-input bg-card")}>
                      {elegida && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
