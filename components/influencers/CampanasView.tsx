"use client";

import { useMemo, useState } from "react";
import { CirclePause, CirclePlay, Download, Loader2, Megaphone, MoreHorizontal, RefreshCcw, RefreshCw, UserPlus } from "lucide-react";
import { BarAction, BarButton, BarDivider, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toaster";
import { cambiarInfluencers, pedirInfluencity, useInfluencers } from "@/hooks/useInfluencers";
import { useInfluencity } from "@/hooks/useInfluencity";
import { asignarCliente } from "@/lib/influencity/datos";
import { estadoTracking, fechaDia, numero, trackingActivo, trackingPausado, type Tracking } from "@/lib/influencity/tipos";
import { fold, timeAgo } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { AsignarCliente } from "./AsignarCliente";
import { Card, Encabezado, FaltaMigracion, InfluencersNav, Pildoras, SinConexion } from "./comun";
import { ElegirPerfiles } from "./ElegirPerfiles";
import { NuevaCampanaDialog } from "./NuevaCampanaDialog";

type Filtro = "todas" | "activas" | "sin-cliente";

const FILTROS: { value: Filtro; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "activas", label: "Activas" },
  { value: "sin-cliente", label: "Sin cliente" },
];

function Estado({ t }: { t: Tracking }) {
  const activa = trackingActivo(t.estado);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        activa ? "bg-emerald-100 text-emerald-900" : trackingPausado(t.estado) ? "bg-primary/30" : "bg-secondary text-muted-foreground"
      )}
    >
      {activa && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-600" />}
      {t.en_influencity ? estadoTracking(t.estado) : "Ya no está en Influencity"}
    </span>
  );
}

/**
 * Las campañas que mide Influencity (trackings): de qué cliente es cada una, su estado y lo que se
 * les puede hacer. Abajo, los clientes y campañas que Influencity anota en las publicaciones.
 */
export function CampanasView() {
  const { data, loaded, error, sinMigracion } = useInfluencers();
  const inf = useInfluencity({ auto: true });
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [nueva, setNueva] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [sumarA, setSumarA] = useState<Tracking | null>(null);
  const [sumar, setSumar] = useState<string[]>([]);

  const trackings = useMemo(() => {
    const q = fold(buscar).trim();
    return (data?.trackings ?? []).filter(
      (t) =>
        (!q || fold(t.nombre).includes(q)) &&
        (filtro === "todas" || (filtro === "activas" ? trackingActivo(t.estado) && t.en_influencity : !t.brand_id))
    );
  }, [data, buscar, filtro]);

  const accion = async (t: Tracking, accion: "pausar" | "reanudar" | "refrescar" | "leer", ok: string) => {
    setOcupada(t.id);
    await cambiarInfluencers(async () => {
      const r = await pedirInfluencity<{ publicaciones?: number }>(`/trackings/${t.id}`, { accion });
      if (accion === "leer") toast(`${numero(r.publicaciones ?? 0)} publicaciones al día`);
    }, accion === "leer" ? undefined : ok);
    setOcupada(null);
  };

  const sumarPerfiles = async () => {
    if (!sumarA || !sumar.length) return;
    const t = sumarA;
    setOcupada(t.id);
    const ok = await cambiarInfluencers(() => pedirInfluencity(`/trackings/${t.id}`, { accion: "agregar", perfiles: sumar }), `${sumar.length === 1 ? "Sumado" : `${sumar.length} sumados`} a ${t.nombre}`);
    setOcupada(null);
    if (ok) {
      setSumarA(null);
      setSumar([]);
    }
  };

  const plan = inf.data?.conexion?.datos;
  const sinTracking = plan?.tracking === false || inf.data?.sync?.resumen?.sinTracking;
  const lugares = inf.cuotas?.tracking;

  return (
    <div className="min-h-screen">
      <ContextBar>
        <InfluencersNav />
        <BarDivider />
        <BarSearch value={buscar} onChange={setBuscar} placeholder="Buscar una campaña" className="w-[clamp(7rem,16vw,12rem)]" />
        {inf.conectada && (
          <>
            <BarDivider />
            <BarButton
              label={inf.corriendo ? `Sincronizando: ${inf.pasoNombre ?? ""}` : "Traer lo nuevo de Influencity"}
              icon={inf.corriendo ? Loader2 : RefreshCw}
              onClick={inf.sincronizar}
              disabled={inf.corriendo}
              className={cn(inf.corriendo && "[&>svg]:animate-spin")}
            />
            {!sinTracking && (
              <BarAction label="Nueva campaña" icon={Megaphone} onClick={() => setNueva(true)}>
                Nueva campaña
              </BarAction>
            )}
          </>
        )}
      </ContextBar>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <Encabezado titulo="Campañas">
          Lo que mide Influencity y de qué cliente es cada cosa. Sin elegirlo, el cliente sale del nombre de la campaña o de las cuentas que se mencionan.
        </Encabezado>

        {sinMigracion || inf.sinMigracion ? (
          <FaltaMigracion className="mx-auto mb-6 max-w-2xl" />
        ) : inf.loaded && !inf.conectada ? (
          <SinConexion className="mx-auto mb-6 max-w-2xl" />
        ) : sinTracking ? (
          <p className="mx-auto mb-6 max-w-2xl rounded-2xl bg-primary/25 px-4 py-3 text-sm">El plan de Influencity no incluye Content Tracking: no hay campañas para traer.</p>
        ) : null}

        {error && !sinMigracion ? (
          <p className="mx-auto max-w-md rounded-2xl border bg-card p-4 text-center text-sm text-destructive">{error}</p>
        ) : !loaded || !data ? (
          <div className="space-y-2" aria-busy>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Pildoras<Filtro> label="Mostrar" value={filtro} onChange={setFiltro} options={FILTROS} />
              {lugares && lugares.limite != null && (
                <p className="text-xs text-muted-foreground">
                  Lugares para perfiles: <span className="font-medium text-foreground">{lugares.restantes ?? 0}</span> de {lugares.limite}
                </p>
              )}
            </div>

            <section aria-label="Campañas" className="overflow-hidden rounded-3xl border bg-card shadow-sm">
              {trackings.length === 0 ? (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  {data.trackings.length ? "Ninguna campaña con ese filtro." : "Todavía no hay campañas. Se traen solas de Influencity, o creá una."}
                </p>
              ) : (
                <ul className="divide-y">
                  {trackings.map((t) => (
                    <li key={t.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap", !t.en_influencity && "opacity-70")}>
                      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                        <p className="flex items-center gap-2">
                          <span className="truncate font-medium">{t.nombre}</span>
                          <Estado t={t} />
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.tipo === "profile" ? "Todo lo de un perfil" : "Menciones, hashtags o palabras"} · {fechaDia(t.inicio)}
                          {t.fin ? ` → ${fechaDia(t.fin)}` : ""} · {t.publicaciones != null ? `${numero(t.publicaciones)} publicaciones` : "sin leer todavía"}
                          {t.leido && <span className="hidden sm:inline"> · leída {timeAgo(t.leido, Date.now())}</span>}
                        </p>
                      </div>
                      <AsignarCliente
                        label={`Cliente de ${t.nombre}`}
                        value={t.brand_id}
                        manual={t.brand_manual}
                        onChange={(brand, auto) => cambiarInfluencers(() => asignarCliente("tracking", t.id, brand, auto), auto ? "Vuelve a ser automático" : "Cliente guardado")}
                      />
                      {inf.conectada && t.en_influencity && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="iconSm" aria-label={`Acciones de ${t.nombre}`} disabled={ocupada === t.id} className="rounded-full">
                              {ocupada === t.id ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[14rem]">
                            <DropdownMenuItem onSelect={() => accion(t, "leer", "")}>
                              <Download className="h-4 w-4" /> Traer sus publicaciones ahora
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => accion(t, "refrescar", "Influencity va a actualizar sus métricas")}>
                              <RefreshCcw className="h-4 w-4" /> Pedir a Influencity que la actualice
                            </DropdownMenuItem>
                            {t.tipo !== "profile" && (
                              <DropdownMenuItem onSelect={() => setSumarA(t)}>
                                <UserPlus className="h-4 w-4" /> Sumar influencers
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {trackingActivo(t.estado) && (
                              <DropdownMenuItem onSelect={() => accion(t, "pausar", "Campaña pausada")}>
                                <CirclePause className="h-4 w-4" /> Pausar
                              </DropdownMenuItem>
                            )}
                            {trackingPausado(t.estado) && (
                              <DropdownMenuItem onSelect={() => accion(t, "reanudar", "Campaña reanudada")}>
                                <CirclePlay className="h-4 w-4" /> Reanudar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data.grupos.length > 0 && (
              <Card
                title="Clientes y campañas de Influencity"
                hint="Influencity anota en cada publicación su cliente o campaña. Si coinciden con un cliente de acá, mandan sobre la campaña."
              >
                <ul className="divide-y">
                  {data.grupos.map((g) => (
                    <li key={`${g.tipo}:${g.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{g.nombre ?? g.id}</span>
                        <span className="text-xs text-muted-foreground">{g.tipo === "cliente" ? "Cliente en Influencity" : "Campaña en Influencity"}</span>
                      </span>
                      <AsignarCliente
                        label={`Cliente de ${g.nombre ?? g.id}`}
                        value={g.brand_id}
                        manual={g.brand_manual}
                        onChange={(brand, auto) => cambiarInfluencers(() => asignarCliente(g.tipo, g.id, brand, auto), auto ? "Vuelve a ser automático" : "Cliente guardado")}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </main>

      <NuevaCampanaDialog open={nueva} onOpenChange={setNueva} />

      <Dialog open={sumarA !== null} onOpenChange={(o) => !o && setSumarA(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sumar influencers</DialogTitle>
            <DialogDescription>A {sumarA?.nombre}. Influencity empieza a medir lo que publiquen con los filtros de la campaña.</DialogDescription>
          </DialogHeader>
          <ElegirPerfiles elegidos={sumar} onChange={setSumar} cliente={sumarA?.brand_id} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSumarA(null)}>
              Cancelar
            </Button>
            <Button onClick={sumarPerfiles} disabled={!sumar.length || ocupada === sumarA?.id}>
              {ocupada === sumarA?.id ? <Loader2 className="animate-spin" /> : <UserPlus />}
              Sumar {sumar.length || ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
