"use client";

import { useMemo, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { BarButton, BarDivider, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { FilterSelect } from "@/components/ui/filter-select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { useClients } from "@/hooks/useClients";
import { cambiarEquipo, useEquipo } from "@/hooks/useEquipo";
import { equipoRepo, NIVEL_LABEL, type EquipoData, type Persona } from "@/lib/board/equipo";
import { fold } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { Avatar, BoardNav, hace } from "./comun";
import { HubsPanel } from "./equipo/HubsPanel";
import { MarcasDialog } from "./equipo/MarcasDialog";
import { Chip, MultiPick, SelectSimple, type Opcion } from "./equipo/piezas";
import { PuestosPanel } from "./equipo/PuestosPanel";

type Pestana = "personas" | "hubs" | "puestos";

const ROLES: Opcion[] = [
  { value: "empleado", label: "Empleado" },
  { value: "admin", label: "Admin" },
];

/**
 * Board → Equipo: quién es quién. Los admins configuran puestos, hubs, roles y quién está activo;
 * cada uno puede elegir de qué marcas es designado.
 */
export function EquipoView() {
  const { data, error, sinMigracion, loaded, admin } = useEquipo();
  const { clients } = useClients();
  const [pestana, setPestana] = useState<Pestana>("personas");
  const [buscar, setBuscar] = useState("");
  const [trayendo, setTrayendo] = useState(false);

  async function traer() {
    setTrayendo(true);
    let nuevos = 0;
    const ok = await cambiarEquipo(async () => {
      nuevos = await equipoRepo.traerDeBasecamp();
    });
    setTrayendo(false);
    if (ok) toast(nuevos ? `${nuevos} ${nuevos === 1 ? "persona nueva" : "personas nuevas"} desde Basecamp` : "No hay gente nueva en Basecamp");
  }

  return (
    <div className="min-h-screen">
      <ContextBar>
        <BoardNav />
        <BarDivider />
        <BarSearch value={buscar} onChange={setBuscar} placeholder={pestana === "personas" ? "Buscar una persona" : "Buscar"} />
        {admin && (
          <BarButton label="Traer gente nueva de Basecamp" icon={trayendo ? Loader2 : UserPlus} onClick={traer} disabled={trayendo} className={cn(trayendo && "[&>svg]:animate-spin")} />
        )}
      </ContextBar>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-6 text-center">
          <h1 className="font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">Equipo</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Quién es quién: puestos, sectores, hubs y de qué marcas es designado cada uno.
            {loaded && data && !admin && " Los puestos y los hubs los configura un admin; tus marcas las podés elegir vos."}
            {loaded && data?.conActividad &&
              " Activo se calcula solo: sin nada en Basecamp ni en la app por 30 días, queda inactivo (los admins no se tocan; lo que cambies a mano queda fijo)."}
          </p>
        </div>

        {sinMigracion ? (
          <p className="rounded-2xl bg-primary/20 p-4 text-center text-sm">
            Falta correr <code className="rounded bg-ink/10 px-1 text-[12px]">supabase/migracion-equipo.sql</code> en Supabase.
          </p>
        ) : error ? (
          <p className="rounded-2xl bg-primary/20 p-4 text-center text-sm">{error}</p>
        ) : !loaded || !data ? (
          <div className="skeleton h-64 rounded-3xl" />
        ) : (
          <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
            <div className="mb-4 flex justify-center">
              <TabsList>
                <TabsTrigger value="personas">Personas · {data.personas.filter((p) => p.activo).length}</TabsTrigger>
                <TabsTrigger value="hubs">Hubs · {data.hubs.length}</TabsTrigger>
                <TabsTrigger value="puestos">Puestos · {data.puestos.length}</TabsTrigger>
              </TabsList>
            </div>
            {pestana === "personas" && <PersonasPanel data={data} buscar={buscar} admin={admin} />}
            {pestana === "hubs" && <HubsPanel data={data} marcas={clients} admin={admin} />}
            {pestana === "puestos" && <PuestosPanel data={data} admin={admin} />}
          </Tabs>
        )}
      </main>
    </div>
  );
}

const GRID = "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_9.5rem_7rem_7.5rem_3rem]";

function PersonasPanel({ data, buscar, admin }: { data: EquipoData; buscar: string; admin: boolean }) {
  const { clients } = useClients();
  const [soloActivos, setSoloActivos] = useState(true);
  const [sectoresFiltro, setSectoresFiltro] = useState<string[]>([]);
  const [marcasDe, setMarcasDe] = useState<Persona | null>(null);
  const yo = data.yo?.equipo_id ?? null;

  const puestoOpciones: Opcion[] = useMemo(
    () =>
      data.puestos.map((p) => ({
        value: p.id,
        label: p.nombre,
        group: NIVEL_LABEL[p.nivel],
        hint: p.sectores.map((id) => data.sectores.find((s) => s.id === id)?.nombre ?? id).join(", "),
      })),
    [data.puestos, data.sectores]
  );
  const puestoPorId = useMemo(() => new Map(data.puestos.map((p) => [p.id, p])), [data.puestos]);
  const hubOpciones: Opcion[] = useMemo(() => data.hubs.map((h) => ({ value: h.id, label: h.nombre })), [data.hubs]);
  const sectoresDe = (p: Persona) => new Set(p.puestos.flatMap((id) => puestoPorId.get(id)?.sectores ?? []));
  const marcasCuenta = (p: Persona) => data.designaciones.filter((d) => d.persona_id === p.id).length;

  const lista = useMemo(() => {
    const q = fold(buscar).trim();
    return data.personas
      .filter((p) => !soloActivos || p.activo)
      .filter((p) => !q || fold(p.nombre).includes(q) || fold(p.email ?? "").includes(q) || fold(p.cargo ?? "").includes(q))
      .filter((p) => {
        if (!sectoresFiltro.length) return true;
        const s = sectoresDe(p);
        // "sin" = los que todavía no tienen puesto: lo primero a completar.
        return sectoresFiltro.some((f) => (f === "__sin" ? !p.puestos.length : s.has(f)));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.personas, buscar, soloActivos, sectoresFiltro, puestoPorId]);

  const marcaActual = marcasDe ? (data.personas.find((p) => p.id === marcasDe.id) ?? null) : null;
  const inactivos = data.personas.filter((p) => !p.activo).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border bg-card p-0.5">
          {[
            { v: true, label: "Activos" },
            { v: false, label: `Todos · ${data.personas.length}` },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setSoloActivos(o.v)}
              className={cn("h-8 rounded-full px-3 text-[13px] font-medium", soloActivos === o.v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {o.label}
            </button>
          ))}
        </div>
        <FilterSelect
          label="Sector"
          options={[{ value: "__sin", label: "Sin puesto todavía" }, ...data.sectores.map((s) => ({ value: s.id, label: s.nombre, group: s.area }))]}
          selected={sectoresFiltro}
          onChange={setSectoresFiltro}
          className="h-9 rounded-full"
        />
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {lista.length} {lista.length === 1 ? "persona" : "personas"}
          {soloActivos && inactivos ? ` · ${inactivos} inactivos ocultos` : ""}
        </span>
      </div>

      <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className={cn("hidden gap-3 border-b bg-secondary/40 px-4 py-2.5 sm:grid", GRID)}>
          {["Persona", "Puestos", "Hub", "Marcas", "Rol", "Activo"].map((h) => (
            <span key={h} className="eyebrow text-muted-foreground">
              {h}
            </span>
          ))}
        </div>
        <ul className="divide-y">
          {lista.map((p) => {
            const esYo = p.id === yo;
            const n = marcasCuenta(p);
            return (
              <li key={p.id} className={cn("grid grid-cols-1 items-center gap-2 px-4 py-2.5 sm:gap-3", GRID, !p.activo && "opacity-60")}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar nombre={p.nombre} url={p.avatar_url} className="h-8 w-8" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      <span className="truncate">{p.nombre}</span>
                      {esYo && <Chip tono="suave">vos</Chip>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.cargo || p.email || "—"}
                      {p.bc_persona_id == null && " · sin Basecamp"}
                    </p>
                    {data.conActividad && (
                      <p className="truncate text-[11px] text-muted-foreground" title="Lo último que hizo en Basecamp, en la app o cuando la etiquetaron en una tarea nueva">
                        {!p.actividad_medida && !p.ultima_actividad
                          ? "Actividad sin leer todavía"
                          : p.ultima_actividad
                            ? `Última actividad: ${hace(p.ultima_actividad)}`
                            : "Sin actividad registrada"}
                      </p>
                    )}
                  </div>
                </div>

                <MultiPick
                  opciones={puestoOpciones}
                  elegidos={p.puestos}
                  onChange={(next) => cambiarEquipo(() => equipoRepo.ponerPuestos(p.id, p.puestos, next))}
                  disabled={!admin}
                >
                  {p.puestos.length ? (
                    p.puestos.map((id) => <Chip key={id}>{puestoPorId.get(id)?.nombre ?? "?"}</Chip>)
                  ) : (
                    <span className="text-xs text-muted-foreground">{admin ? "Elegir puesto" : "Sin puesto"}</span>
                  )}
                </MultiPick>

                {admin ? (
                  <SelectSimple
                    value={p.hub_id}
                    onChange={(v) => cambiarEquipo(() => equipoRepo.actualizarPersona(p.id, { hub_id: v }))}
                    opciones={hubOpciones}
                    ninguno="Sin hub"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">{data.hubs.find((h) => h.id === p.hub_id)?.nombre ?? "—"}</span>
                )}

                <button
                  type="button"
                  onClick={() => setMarcasDe(p)}
                  className={cn(
                    "h-8 justify-self-start rounded-full border px-3 text-[13px] font-medium transition-colors hover:border-foreground/30",
                    !n && "text-muted-foreground"
                  )}
                >
                  {n ? `${n} ${n === 1 ? "marca" : "marcas"}` : admin || esYo ? "Elegir" : "Ninguna"}
                </button>

                {admin ? (
                  <SelectSimple
                    value={p.rol}
                    onChange={(v) => v && cambiarEquipo(() => equipoRepo.actualizarPersona(p.id, { rol: v as Persona["rol"] }))}
                    opciones={ROLES}
                    // Un admin no se saca el permiso a sí mismo (podría quedar sin ningún admin).
                    disabled={esYo}
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">{p.rol === "admin" ? "Admin" : "Empleado"}</span>
                )}

                {admin ? (
                  <span className="flex flex-col items-start gap-0.5">
                    <Switch
                      checked={p.activo}
                      // A mano queda fijo: la regla de actividad ya no la cambia.
                      onCheckedChange={(on) =>
                        cambiarEquipo(() => equipoRepo.actualizarPersona(p.id, data.conActividad ? { activo: on, activo_manual: on } : { activo: on }))
                      }
                      disabled={esYo}
                      aria-label={`${p.nombre} activo`}
                    />
                    {data.conActividad && p.rol !== "admin" && (
                      p.activo_manual === null ? (
                        <span className="text-[10px] text-muted-foreground">auto</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => cambiarEquipo(() => equipoRepo.actualizarPersona(p.id, { activo_manual: null }), "Vuelve a calcularse por su actividad")}
                          title="Lo fijó un admin. Tocá para que vuelva a calcularse por su actividad."
                          className="text-[10px] font-medium underline-offset-2 hover:underline"
                        >
                          fijo · auto
                        </button>
                      )
                    )}
                  </span>
                ) : (
                  <span />
                )}
              </li>
            );
          })}
          {!lista.length && <li className="p-8 text-center text-sm text-muted-foreground">Nadie coincide con la búsqueda.</li>}
        </ul>
      </div>

      <MarcasDialog
        persona={marcaActual}
        data={data}
        marcas={clients}
        editable={admin || marcaActual?.id === yo}
        admin={admin}
        onClose={() => setMarcasDe(null)}
      />
    </div>
  );
}
