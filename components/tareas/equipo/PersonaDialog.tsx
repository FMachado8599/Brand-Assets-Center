"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useClients } from "@/hooks/useClients";
import { cambiarEquipo } from "@/hooks/useEquipo";
import { equipoRepo, NIVEL_LABEL, type EquipoData, type Persona } from "@/lib/board/equipo";
import { Avatar, hace } from "../comun";
import { MarcasDialog } from "./MarcasDialog";
import { Chip, MultiPick, SelectSimple, type Opcion } from "./piezas";

const ROLES: Opcion[] = [
  { value: "empleado", label: "Empleado" },
  { value: "admin", label: "Admin" },
];

/** Todo de una persona del equipo, para tocar desde el organigrama. Los admins editan; el resto mira. */
export function PersonaDialog({ persona, data, admin, onClose }: { persona: Persona | null; data: EquipoData; admin: boolean; onClose: () => void }) {
  const { clients } = useClients();
  const [marcas, setMarcas] = useState(false);
  // La persona del momento en que se abrió: lo actualizado sale de data.
  const p = persona ? (data.personas.find((x) => x.id === persona.id) ?? persona) : null;
  const yo = data.yo?.equipo_id ?? null;

  const puestoOpciones: Opcion[] = useMemo(
    () =>
      data.puestos.map((x) => ({
        value: x.id,
        label: x.nombre,
        group: NIVEL_LABEL[x.nivel],
        hint: x.sectores.map((id) => data.sectores.find((s) => s.id === id)?.nombre ?? id).join(", "),
      })),
    [data.puestos, data.sectores]
  );
  // Para "depende de": cualquiera que no sea ella ni alguien que depende de ella (sería un círculo).
  const jefes: Opcion[] = useMemo(() => {
    if (!p) return [];
    const debajo = new Set<string>([p.id]);
    let creció = true;
    while (creció) {
      creció = false;
      for (const x of data.personas) if (!debajo.has(x.id) && x.jefes.some((j) => debajo.has(j))) (debajo.add(x.id), (creció = true));
    }
    return data.personas.filter((x) => x.activo && !debajo.has(x.id)).map((x) => ({ value: x.id, label: x.nombre }));
  }, [p, data.personas]);

  if (!p) return <Dialog open={false} />;
  const n = data.designaciones.filter((d) => d.persona_id === p.id).length;
  const fila = "grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3 text-sm";

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-lg gap-5">
          <div className="flex items-center gap-3 pr-8">
            <Avatar nombre={p.nombre} url={p.avatar_url} className="h-12 w-12 text-sm" />
            <div className="min-w-0">
              <DialogTitle className="truncate">{p.nombre}</DialogTitle>
              <DialogDescription className="truncate">
                {[p.cargo, p.email].filter(Boolean).join(" · ") || "—"}
                {p.ultima_actividad ? ` · última actividad ${hace(p.ultima_actividad)}` : ""}
              </DialogDescription>
            </div>
          </div>

          <div className="space-y-3">
            <div className={fila}>
              <span className="text-muted-foreground">Puestos</span>
              <MultiPick opciones={puestoOpciones} elegidos={p.puestos} onChange={(next) => cambiarEquipo(() => equipoRepo.ponerPuestos(p.id, p.puestos, next))} disabled={!admin}>
                {p.puestos.length ? (
                  p.puestos.map((id) => <Chip key={id}>{data.puestos.find((x) => x.id === id)?.nombre ?? "?"}</Chip>)
                ) : (
                  <span className="text-xs text-muted-foreground">{admin ? "Elegir puesto" : "Sin puesto"}</span>
                )}
              </MultiPick>
            </div>
            <div className={fila}>
              <span className="text-muted-foreground">Depende de</span>
              {admin && data.conOrganigrama ? (
                // Uno o más jefes (ej: la coordinadora de redacción y CM depende de los dos directores
                // digitales). Elegir a alguien lo pone en el organigrama; sin nadie queda arriba de todo.
                <MultiPick opciones={jefes} elegidos={p.jefes} onChange={(next) => cambiarEquipo(() => equipoRepo.ponerJefes(p.id, next))}>
                  {p.jefes.length ? (
                    p.jefes.map((id) => <Chip key={id}>{data.personas.find((x) => x.id === id)?.nombre ?? "?"}</Chip>)
                  ) : (
                    <span className="text-xs text-muted-foreground">{p.en_organigrama ? "Nadie (arriba de todo)" : "Sin ubicar · elegir jefes"}</span>
                  )}
                </MultiPick>
              ) : (
                <span>
                  {p.jefes.map((id) => data.personas.find((x) => x.id === id)?.nombre).filter(Boolean).join(", ") ||
                    (p.en_organigrama ? "Nadie" : "Sin ubicar")}
                </span>
              )}
            </div>
            <div className={fila}>
              <span className="text-muted-foreground">Hub o equipo</span>
              {admin ? (
                <SelectSimple
                  value={p.hub_id}
                  onChange={(v) => cambiarEquipo(() => equipoRepo.actualizarPersona(p.id, { hub_id: v }))}
                  opciones={data.hubs.map((h) => ({ value: h.id, label: h.tipo === "cliente" ? `${h.nombre} (equipo de cliente)` : h.nombre }))}
                  ninguno="Ninguno"
                />
              ) : (
                <span>{data.hubs.find((h) => h.id === p.hub_id)?.nombre ?? "—"}</span>
              )}
            </div>
            <div className={fila}>
              <span className="text-muted-foreground">Marcas</span>
              <button
                type="button"
                onClick={() => setMarcas(true)}
                className="h-8 justify-self-start rounded-full border px-3 text-[13px] font-medium transition-colors hover:border-foreground/30"
              >
                {n ? `${n} ${n === 1 ? "marca" : "marcas"}` : admin || p.id === yo ? "Elegir" : "Ninguna"}
              </button>
            </div>
            <div className={fila}>
              <span className="text-muted-foreground">Rol</span>
              {admin ? (
                <SelectSimple
                  value={p.rol}
                  onChange={(v) => v && cambiarEquipo(() => equipoRepo.actualizarPersona(p.id, { rol: v as Persona["rol"] }))}
                  opciones={ROLES}
                  disabled={p.id === yo}
                />
              ) : (
                <span>{p.rol === "admin" ? "Admin" : "Empleado"}</span>
              )}
            </div>
            {admin && (
              <div className={fila}>
                <span className="text-muted-foreground">Activo</span>
                <span className="flex items-center gap-2">
                  <Switch
                    checked={p.activo}
                    onCheckedChange={(on) =>
                      cambiarEquipo(() => equipoRepo.actualizarPersona(p.id, data.conActividad ? { activo: on, activo_manual: on } : { activo: on }))
                    }
                    disabled={p.id === yo}
                    aria-label={`${p.nombre} activo`}
                  />
                  {data.conActividad && p.rol !== "admin" && (
                    <span className="text-xs text-muted-foreground">{p.activo_manual === null ? "según su actividad" : "fijado a mano"}</span>
                  )}
                </span>
              </div>
            )}
          </div>

          {admin && p.en_organigrama && (
            <button
              type="button"
              onClick={() => cambiarEquipo(() => equipoRepo.sacar(p.id), `${p.nombre} quedó sin ubicar`).then(onClose)}
              className="justify-self-start text-sm font-medium text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
            >
              Sacar del organigrama
            </button>
          )}
        </DialogContent>
      </Dialog>
      {marcas && <MarcasDialog persona={p} data={data} marcas={clients} editable={admin || p.id === yo} admin={admin} onClose={() => setMarcas(false)} />}
    </>
  );
}
