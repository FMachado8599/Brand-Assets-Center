"use client";

import { useState } from "react";
import { ArrowUpRight, History, KeyRound, Loader2, RefreshCw, Unplug } from "lucide-react";
import { BarAction, BarButton, BarDivider, ContextBar } from "@/components/shell/ContextBar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { pedirInfluencity } from "@/hooks/useInfluencers";
import { refreshInfluencity, sincronizarInfluencity, useInfluencity } from "@/hooks/useInfluencity";
import { numero } from "@/lib/influencity/tipos";
import { timeAgo } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { Card, Encabezado, FaltaMigracion, InfluencersNav } from "./comun";

function Cuota({ titulo, restantes, limite, hint }: { titulo: string; restantes: number | null; limite: number | null; hint: string }) {
  const sinLimite = limite == null;
  const usado = !sinLimite && limite ? Math.max(0, Math.min(1, 1 - (restantes ?? 0) / limite)) : 0;
  return (
    <div className="rounded-2xl bg-secondary/55 p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{sinLimite ? "Sin límite" : `${numero(restantes)} de ${numero(limite)}`}</p>
      {!sinLimite && (
        <span aria-hidden className="mt-2 block h-1.5 overflow-hidden rounded-full bg-card">
          <span className="block h-full rounded-full bg-ink" style={{ width: `${usado * 100}%` }} />
        </span>
      )}
      <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * La conexión con Influencity: un token de la API para todo el estudio (se guarda cifrado), qué
 * incluye el plan, lo que queda de las cuotas y la sincronización.
 */
export function ConexionView() {
  const inf = useInfluencity();
  const confirm = useConfirm();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const conexion = inf.data?.conexion ?? null;
  const sync = inf.data?.sync ?? null;
  const resumen = sync?.resumen ?? null;

  const conectar = async () => {
    if (!token.trim() || busy) return;
    setBusy(true);
    try {
      const r = await pedirInfluencity<{ tracking: boolean }>("", { token });
      setToken("");
      toast(r.tracking ? "Influencity conectado. Trayendo todo…" : "Influencity conectado (el plan no incluye Content Tracking)");
      await refreshInfluencity();
      sincronizarInfluencity({ completa: true });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const desconectar = async () => {
    const ok = await confirm({
      title: "¿Desconectar Influencity?",
      description: "Se borra el token guardado. Lo que ya se trajo (influencers, campañas, métricas) queda.",
      confirmLabel: "Desconectar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await pedirInfluencity("", undefined, "DELETE");
      toast("Influencity desconectado");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    refreshInfluencity();
  };

  return (
    <div className="min-h-screen">
      <ContextBar>
        <InfluencersNav />
        {conexion && (
          <>
            <BarDivider />
            <BarButton label="Traer lo nuevo" icon={RefreshCw} onClick={inf.sincronizar} disabled={inf.corriendo} />
            <BarAction label="Traer todo de nuevo" icon={inf.corriendo ? Loader2 : History} onClick={inf.sincronizarTodo} disabled={inf.corriendo} className={cn(inf.corriendo && "[&>svg]:animate-spin")}>
              {inf.corriendo ? inf.pasoNombre ?? "Sincronizando" : "Traer todo"}
            </BarAction>
          </>
        )}
      </ContextBar>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <Encabezado titulo="Influencity">La cuenta del estudio en Influencity: el token de la API, lo que queda del plan y la sincronización.</Encabezado>

        {inf.sinMigracion && <FaltaMigracion className="mb-6" />}

        <div className="space-y-4">
          <Card
            title="Conexión"
            action={
              conexion ? (
                <Button variant="ghost" size="sm" onClick={desconectar} className="rounded-full text-muted-foreground">
                  <Unplug /> Desconectar
                </Button>
              ) : undefined
            }
          >
            {!inf.loaded ? (
              <div className="skeleton h-16 rounded-xl" />
            ) : inf.error && !inf.sinMigracion ? (
              <p className="text-sm text-destructive">{inf.error}</p>
            ) : inf.data && !inf.data.listo.secreto ? (
              <p className="rounded-xl bg-primary/20 p-3 text-sm">Falta INTEGRACIONES_SECRET en las variables del servidor (al menos 32 caracteres).</p>
            ) : conexion ? (
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="eyebrow text-muted-foreground">Token</dt>
                  <dd className="mt-0.5 font-mono font-medium">••••{conexion.datos.final ?? ""}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">Conectado</dt>
                  <dd className="mt-0.5 font-medium">{timeAgo(conexion.conectada, Date.now())}</dd>
                  {conexion.conectada_por && <dd className="text-xs text-muted-foreground">por {conexion.conectada_por}</dd>}
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">El plan incluye</dt>
                  <dd className="mt-0.5 font-medium">
                    {[conexion.datos.tracking !== false && "Campañas", conexion.datos.perfiles !== false && "Perfiles"].filter(Boolean).join(" y ") || "—"}
                  </dd>
                </div>
              </dl>
            ) : (
              <form
                className="space-y-3 text-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  conectar();
                }}
              >
                <p className="text-muted-foreground">
                  Pegá el token de la API de Influencity (lo genera un admin de la cuenta en Influencity). Se prueba antes de guardarlo y queda cifrado: nadie lo puede ver
                  desde la app.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="relative flex-1">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="password"
                      value={token}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Token de la API"
                      aria-label="Token de la API de Influencity"
                      className="pl-9 font-mono"
                      onChange={(e) => setToken(e.target.value)}
                    />
                  </label>
                  <Button type="submit" disabled={!token.trim() || busy} className="rounded-full">
                    {busy && <Loader2 className="animate-spin" />}
                    Conectar
                  </Button>
                </div>
                <a href="https://docs.influencity.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  Documentación de la API <ArrowUpRight className="h-3 w-3" />
                </a>
              </form>
            )}
          </Card>

          {conexion && (
            <>
              <Card title="Sincronización" hint="Se trae sola cada 3 horas al abrir Influencers. Las campañas terminadas se dejan de leer 14 días después del fin.">
                <div className="rounded-xl bg-secondary/55 p-3 text-sm" aria-live="polite">
                  {inf.corriendo ? (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {inf.pasoNombre}
                      {inf.detalle ? ` · ${inf.detalle}` : "…"}
                    </span>
                  ) : (
                    <>
                      <p className="font-medium">Última vez: {sync?.ultimo ? timeAgo(sync.ultimo, Date.now()) : "nunca"}</p>
                      {resumen && sync?.ultimo && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[
                            resumen.completa ? "todo de nuevo" : "lo nuevo",
                            resumen.trackings != null && `${numero(resumen.trackings)} campañas`,
                            resumen.publicaciones != null && `${numero(resumen.publicaciones)} publicaciones`,
                            resumen.perfiles != null && `${numero(resumen.perfiles)} perfiles`,
                            resumen.perfilesSinDatos ? `${numero(resumen.perfilesSinDatos)} perfiles sin datos` : null,
                            resumen.asignadas ? `${numero(resumen.asignadas)} publicaciones cambiaron de cliente` : null,
                            resumen.requests != null && `${numero(resumen.requests)} pedidos a Influencity`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {sync?.ultimo_error && <p className="mt-1 text-xs text-destructive">La última vez falló: {sync.ultimo_error}</p>}
                    </>
                  )}
                </div>
              </Card>

              <Card title="Lo que queda del plan" hint={inf.cuotas?.leidas ? `Leído ${timeAgo(inf.cuotas.leidas, Date.now())}.` : undefined}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {inf.cuotas?.tracking ? (
                    <Cuota titulo="Lugares para perfiles en campañas" restantes={inf.cuotas.tracking.restantes} limite={inf.cuotas.tracking.limite} hint="Cada influencer que se suma a una campaña activa ocupa uno." />
                  ) : (
                    <p className="rounded-2xl bg-secondary/55 p-3 text-xs text-muted-foreground">El plan no incluye campañas (Content Tracking).</p>
                  )}
                  {inf.cuotas?.analisis ? (
                    <Cuota titulo="Análisis de audiencia" restantes={inf.cuotas.analisis.restantes} limite={inf.cuotas.analisis.limite} hint="Por período. Analizar o actualizar la audiencia de un perfil gasta uno." />
                  ) : (
                    <p className="rounded-2xl bg-secondary/55 p-3 text-xs text-muted-foreground">El plan no incluye análisis de perfiles.</p>
                  )}
                </div>
              </Card>
            </>
          )}

          <Card title="Cómo se sabe de qué cliente es cada publicación">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>Si se eligió a mano en la publicación, eso.</li>
              <li>Si Influencity la anotó con un cliente o una campaña suya que tiene cliente acá.</li>
              <li>El cliente de la campaña (tracking): elegido en Campañas o, si no, el que aparece en su nombre.</li>
              <li>Si la publicó una cuenta del cliente (las redes de su ficha).</li>
              <li>Si menciona o etiqueta a una cuenta del cliente.</li>
            </ol>
          </Card>
        </div>
      </main>
    </div>
  );
}
