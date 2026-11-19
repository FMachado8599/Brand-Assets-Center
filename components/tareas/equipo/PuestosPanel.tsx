"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { cambiarEquipo } from "@/hooks/useEquipo";
import { equipoRepo, NIVEL_LABEL, NIVELES, type EquipoData, type Nivel, type Puesto } from "@/lib/board/equipo";
import { Chip, MultiPick, SelectSimple, type Opcion } from "./piezas";

const NIVEL_OPCIONES: Opcion[] = NIVELES.map((n) => ({ value: n, label: NIVEL_LABEL[n] }));

/**
 * Los puestos del estudio: cada uno con su nivel (la jerarquía) y uno o más sectores. Una persona
 * puede tener más de uno ("coordinador de diseño y de redacción").
 */
export function PuestosPanel({ data, admin }: { data: EquipoData; admin: boolean }) {
  const confirm = useConfirm();
  const [nombre, setNombre] = useState("");
  const [nivel, setNivel] = useState<Nivel>("operativo");
  const [sectores, setSectores] = useState<string[]>([]);

  const sectorOpciones: Opcion[] = useMemo(() => data.sectores.map((s) => ({ value: s.id, label: s.nombre, group: s.area })), [data.sectores]);
  const nombreSector = useMemo(() => new Map(data.sectores.map((s) => [s.id, s.nombre])), [data.sectores]);
  const cuantos = (puestoId: string) => data.personas.filter((p) => p.puestos.includes(puestoId)).length;

  async function crear() {
    if (!nombre.trim()) return;
    if (await cambiarEquipo(() => equipoRepo.crearPuesto(nombre, nivel, sectores), `Puesto "${nombre.trim()}" creado`)) {
      setNombre("");
      setSectores([]);
    }
  }

  async function borrar(p: Puesto) {
    const n = cuantos(p.id);
    const ok = await confirm({
      title: `¿Borrar el puesto ${p.nombre}?`,
      description: n ? `Lo tienen ${n} ${n === 1 ? "persona" : "personas"}: se les saca.` : undefined,
      confirmLabel: "Borrar",
      destructive: true,
    });
    if (ok) await cambiarEquipo(() => equipoRepo.borrarPuesto(p.id), "Puesto borrado");
  }

  const chipsSectores = (ids: string[]) =>
    ids.length ? ids.map((id) => <Chip key={id}>{nombreSector.get(id) ?? id}</Chip>) : <span className="text-xs text-muted-foreground">Sin sector</span>;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="hidden grid-cols-[minmax(0,1.3fr)_9rem_minmax(0,1.6fr)_4rem_2.5rem] gap-3 border-b bg-secondary/40 px-4 py-2.5 sm:grid">
          {["Puesto", "Nivel", "Sectores", "Gente", ""].map((h, i) => (
            <span key={i} className="eyebrow text-muted-foreground">
              {h}
            </span>
          ))}
        </div>
        <ul className="divide-y">
          {data.puestos.map((p) => (
            <li key={p.id} className="grid grid-cols-1 items-center gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1.3fr)_9rem_minmax(0,1.6fr)_4rem_2.5rem] sm:gap-3">
              {admin ? (
                <input
                  defaultValue={p.nombre}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== p.nombre) cambiarEquipo(() => equipoRepo.actualizarPuesto(p.id, { nombre: v }));
                  }}
                  className="h-8 min-w-0 rounded-lg bg-transparent px-1.5 text-sm font-medium outline-none hover:bg-secondary/60 focus:bg-secondary/60"
                />
              ) : (
                <span className="text-sm font-medium">{p.nombre}</span>
              )}
              {admin ? (
                <SelectSimple value={p.nivel} onChange={(v) => v && cambiarEquipo(() => equipoRepo.actualizarPuesto(p.id, { nivel: v as Nivel }))} opciones={NIVEL_OPCIONES} />
              ) : (
                <span className="text-sm text-muted-foreground">{NIVEL_LABEL[p.nivel]}</span>
              )}
              <MultiPick
                opciones={sectorOpciones}
                elegidos={p.sectores}
                onChange={(next) => cambiarEquipo(() => equipoRepo.ponerSectoresPuesto(p.id, p.sectores, next))}
                disabled={!admin}
              >
                {chipsSectores(p.sectores)}
              </MultiPick>
              <span className="text-sm tabular-nums text-muted-foreground sm:text-right">{cuantos(p.id)}</span>
              {admin ? (
                <button type="button" onClick={() => borrar(p)} aria-label={`Borrar ${p.nombre}`} className="grid h-8 w-8 place-items-center justify-self-end rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      </div>

      {admin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crear();
          }}
          className="grid grid-cols-1 items-center gap-2 rounded-2xl border bg-card p-2 sm:grid-cols-[minmax(0,1.3fr)_9rem_minmax(0,1.6fr)_auto]"
        >
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Puesto nuevo (ej: Coordinador de CM)" className="h-9 min-w-0 bg-transparent px-2 text-sm outline-none" />
          <SelectSimple value={nivel} onChange={(v) => v && setNivel(v as Nivel)} opciones={NIVEL_OPCIONES} />
          <MultiPick opciones={sectorOpciones} elegidos={sectores} onChange={setSectores}>
            {chipsSectores(sectores)}
          </MultiPick>
          <button type="submit" disabled={!nombre.trim()} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-40">
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </form>
      )}
    </div>
  );
}
