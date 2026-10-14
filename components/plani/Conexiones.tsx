"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, EyeOff, FolderOpen, HardDrive, Loader2, RefreshCw, Search, Unplug } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { useBasecampSync } from "@/hooks/useBasecampSync";
import { refreshClients, useClients } from "@/hooks/useClients";
import { conectarUrl, refreshIntegraciones, useIntegraciones } from "@/hooks/useIntegraciones";
import { basecampRepo, type BcProyecto } from "@/lib/plani/basecamp";
import { fold } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { BasecampMark } from "./BasecampTarea";

function hace(iso: string | null | undefined) {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString("es-UY", { day: "numeric", month: "short" });
}

async function desconectar(proveedor: "basecamp" | "google") {
  const r = await fetch(`/api/integraciones?proveedor=${proveedor}`, { method: "DELETE" });
  if (!r.ok) toast("No se pudo desconectar", "error");
  else toast(proveedor === "basecamp" ? "Basecamp desconectado" : "Drive desconectado");
  refreshIntegraciones();
}

/**
 * Las conexiones del estudio, para el popover de la barra: Basecamp (proyectos → clientes, tareas)
 * y el Drive (material final). Una sola conexión de cada una para todos.
 */
export function ConexionesPanel() {
  const { data, error, sinMigracion, loaded } = useIntegraciones();
  const sync = useBasecampSync();
  const [proyectosOpen, setProyectosOpen] = useState(false);

  if (!loaded) return <div className="skeleton h-28 rounded-xl" />;
  if (error || !data) {
    return (
      <p className="rounded-xl bg-primary/20 p-3 text-sm">
        {sinMigracion ? (
          <>
            Falta correr <code className="rounded bg-ink/10 px-1 text-[12px]">supabase/migracion-integraciones.sql</code> en Supabase.
          </>
        ) : (
          error
        )}
      </p>
    );
  }

  const bc = data.basecamp;
  const g = data.google;
  const resumen = data.sync?.resumen;

  return (
    <div className="space-y-3">
      <section className="rounded-xl bg-secondary/55 p-3">
        <div className="flex items-center gap-2">
          <BasecampMark className="h-5 w-5" />
          <span className="flex-1 text-sm font-semibold">Basecamp</span>
          {bc && (
            <button type="button" onClick={() => desconectar("basecamp")} title="Desconectar" aria-label="Desconectar Basecamp" className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground">
              <Unplug className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {!data.listo.basecamp || !data.listo.secreto ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Falta configurar en el servidor: {[!data.listo.basecamp && "BASECAMP_CLIENT_ID y BASECAMP_CLIENT_SECRET", !data.listo.secreto && "INTEGRACIONES_SECRET"].filter(Boolean).join(" y ")}.
          </p>
        ) : bc ? (
          <>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {bc.cuenta_nombre} · sincronizado {hace(data.sync?.ultimo)}
              {resumen?.proyectos ? ` · ${resumen.proyectos} proyectos` : ""}
            </p>
            {data.sync?.ultimo_error && !sync.corriendo && <p className="mt-1.5 text-xs text-destructive">Último error: {data.sync.ultimo_error}</p>}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={sync.sincronizar}
                disabled={sync.corriendo}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {sync.corriendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {sync.corriendo ? `${sync.pasoNombre}${sync.detalle ? ` · ${sync.detalle}` : "…"}` : "Sincronizar ahora"}
              </button>
              <button
                type="button"
                onClick={() => setProyectosOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-black/[0.08] bg-card px-3 text-xs font-medium hover:bg-secondary"
              >
                Proyectos y clientes
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Cada proyecto de Basecamp aparece como cliente, y las tareas (con su brief y su gente) se ven en las planis.
            </p>
            <a href={conectarUrl("basecamp")} className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:brightness-95">
              Conectar Basecamp
            </a>
          </>
        )}
      </section>

      <section className="rounded-xl bg-secondary/55 p-3">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          <span className="flex-1 text-sm font-semibold">Drive del estudio</span>
          {g && (
            <button type="button" onClick={() => desconectar("google")} title="Desconectar" aria-label="Desconectar el Drive" className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground">
              <Unplug className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {!data.listo.google || !data.listo.secreto ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Falta configurar en el servidor: {[!data.listo.google && "GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET", !data.listo.secreto && "INTEGRACIONES_SECRET"].filter(Boolean).join(" y ")}.
          </p>
        ) : g ? (
          <>
            <p className="mt-1.5 text-xs text-muted-foreground">{g.cuenta_id} · el material final va a carpetas por cliente, plani y día.</p>
            {g.datos?.raiz_url && (
              <a href={g.datos.raiz_url} target="_blank" rel="noopener noreferrer" className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-full border border-black/[0.08] bg-card px-3 text-xs font-medium hover:bg-secondary">
                <FolderOpen className="h-3.5 w-3.5" /> Abrir la carpeta
              </a>
            )}
          </>
        ) : (
          <>
            <p className="mt-1.5 text-xs text-muted-foreground">
              El material final de las planis (fotos, videos, portadas) se guarda ahí. La app solo ve las carpetas que crea ella.
            </p>
            <a href={conectarUrl("google")} className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:brightness-95">
              Conectar el Drive
            </a>
          </>
        )}
      </section>

      <ProyectosDialog open={proyectosOpen} onOpenChange={setProyectosOpen} />
    </div>
  );
}

/**
 * Los proyectos de Basecamp y a qué cliente están vinculados. Los internos se marcan "no es
 * cliente" y la sincronización no los vuelve a tocar.
 */
export function ProyectosDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { clients } = useClients();
  const [proyectos, setProyectos] = useState<BcProyecto[] | null>(null);
  const [q, setQ] = useState("");
  const [verIgnorados, setVerIgnorados] = useState(false);

  const cargar = () => basecampRepo.proyectos().then(({ data }) => setProyectos((data ?? []) as BcProyecto[]));
  useEffect(() => {
    if (open) cargar();
  }, [open]);

  const porId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const lista = useMemo(() => {
    const f = fold(q.trim());
    return (proyectos ?? [])
      .filter((p) => p.estado === "active" && p.ignorado === verIgnorados)
      .filter((p) => !f || fold(p.nombre).includes(f) || fold(porId.get(p.brand_id ?? "")?.name ?? "").includes(f));
  }, [proyectos, q, verIgnorados, porId]);

  const ignorar = async (p: BcProyecto, ignorado: boolean) => {
    setProyectos((prev) => prev?.map((x) => (x.id === p.id ? { ...x, ignorado } : x)) ?? prev);
    const { error } = await basecampRepo.marcarIgnorado(p.id, ignorado);
    if (error) {
      toast(error.message, "error");
      cargar();
    }
  };

  const vincular = async (p: BcProyecto, brandId: string | null) => {
    setProyectos((prev) => prev?.map((x) => (x.id === p.id ? { ...x, brand_id: brandId } : x)) ?? prev);
    const { error } = await basecampRepo.vincular(p.id, brandId);
    if (error) {
      toast(error.message, "error");
      cargar();
    } else refreshClients();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Proyectos de Basecamp</DialogTitle>
          <DialogDescription>
            Cada proyecto es un cliente. Si dos proyectos son del mismo cliente, vinculalos al mismo. Los internos, marcalos como “no es cliente”.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <label className="relative flex flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar proyecto o cliente…"
              className="h-9 w-full rounded-xl border border-black/[0.08] bg-background/60 pl-8 pr-3 text-sm outline-none focus:border-foreground/25"
            />
          </label>
          <button
            type="button"
            aria-pressed={verIgnorados}
            onClick={() => setVerIgnorados((v) => !v)}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium", verIgnorados ? "bg-foreground text-background" : "border border-black/[0.08] bg-card hover:bg-secondary")}
          >
            <EyeOff className="h-3.5 w-3.5" /> No son clientes
          </button>
        </div>
        <ul className="-mx-1 min-h-0 flex-1 divide-y divide-black/[0.06] overflow-y-auto px-1">
          {proyectos === null ? (
            <li className="skeleton my-2 h-12 rounded-xl" />
          ) : !lista.length ? (
            <li className="py-8 text-center text-sm text-muted-foreground">{verIgnorados ? "Ningún proyecto marcado como interno." : "No hay proyectos (¿ya se sincronizó?)."}</li>
          ) : (
            lista.map((p) => {
              const brand = p.brand_id ? porId.get(p.brand_id) : null;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{p.nombre}</span>
                      {p.app_url && (
                        <a href={p.app_url} target="_blank" rel="noopener noreferrer" aria-label="Abrir en Basecamp" className="text-muted-foreground hover:text-foreground">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </span>
                  </span>
                  {!p.ignorado && (
                    <span className="flex items-center gap-1.5">
                      {brand && <ClientMark brand={brand} className="h-6 w-6 rounded-md text-[9px]" pad="p-[12%]" />}
                      <select
                        value={p.brand_id ?? ""}
                        onChange={(e) => vincular(p, e.target.value || null)}
                        className="h-8 max-w-[12rem] rounded-lg border border-black/[0.08] bg-card px-2 text-xs outline-none"
                        aria-label={`Cliente de ${p.nombre}`}
                      >
                        <option value="">Sin cliente (se crea al sincronizar)</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => ignorar(p, !p.ignorado)}
                    className="h-8 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {p.ignorado ? "Es cliente" : "No es cliente"}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
