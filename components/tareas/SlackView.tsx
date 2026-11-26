"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, Hash, Loader2, Plus, RefreshCw, Send, Slack as SlackIcon, Unlink, UserPlus } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { BarAction, BarButton, BarDivider, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm";
import { useClients } from "@/hooks/useClients";
import { useEquipo } from "@/hooks/useEquipo";
import { pedirSlack, useSlack } from "@/hooks/useSlack";
import { copyPlain } from "@/lib/cards/clipboard";
import { pideReconectar } from "@/lib/integraciones/reconectar";
import { manifiestoSlack } from "@/lib/slack/config";
import { fold } from "@/lib/redaccion/text";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BoardNav, hace } from "./comun";

type CanalSlack = { id: string; nombre: string; miembros: number; es_miembro: boolean };

/** "Café Changan" → "cafe-changan" (lo mismo que nombreDeCanal del servidor). */
const slug = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

/**
 * Board → Slack (solo admins): la conexión del bot del estudio, el canal donde salen los cumpleaños,
 * quién está vinculado y el canal de cada marca.
 */
export function SlackView() {
  const { data, error, sinMigracion, loaded, refresh } = useSlack();
  const equipo = useEquipo();
  const { clients } = useClients();
  const confirmar = useConfirm();
  const [canales, setCanales] = useState<CanalSlack[] | null>(null);
  const [buscar, setBuscar] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const conexion = data?.conexion ?? null;
  const configurado = Boolean(data?.listo.slack && data?.listo.secreto);

  // La vuelta de Slack llega con ?slack=conectado o ?slack=error&motivo=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("slack");
    if (!r) return;
    if (r === "conectado") toast("Slack conectado");
    else toast(`Slack: ${params.get("motivo") ?? "no se pudo conectar"}`, "error");
    window.history.replaceState(null, "", window.location.pathname);
    refresh();
  }, [refresh]);

  const cargarCanales = async () => {
    try {
      const r = await pedirSlack<{ canales: CanalSlack[] }>("/api/slack/canales", { method: "GET" });
      setCanales(r.canales);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  useEffect(() => {
    if (conexion) cargarCanales();
  }, [conexion?.team_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function correr<T>(clave: string, fn: () => Promise<T>, ok?: (r: T) => string | null) {
    setOcupado(clave);
    try {
      const r = await fn();
      const msg = ok?.(r);
      if (msg) toast(msg);
      return r;
    } catch (e) {
      const m = (e as Error).message;
      toast(pideReconectar(m) ? m : `No se pudo: ${m}`, "error");
      return null;
    } finally {
      setOcupado(null);
      refresh();
    }
  }

  const conectar = () => {
    window.location.href = `/api/integraciones/slack/conectar?volver=${encodeURIComponent("/board/slack")}`;
  };

  const desconectar = async () => {
    const ok = await confirmar({
      title: "¿Desconectar Slack?",
      description: "Dejan de salir los avisos. Los canales y la gente vinculada quedan guardados para cuando lo vuelvas a conectar.",
      confirmLabel: "Desconectar",
      destructive: true,
    });
    if (ok) await correr("desconectar", () => pedirSlack("/api/integraciones?proveedor=slack", { method: "DELETE" }), () => "Slack desconectado");
  };

  // La gente activa del equipo y si está vinculada en Slack.
  const personas = useMemo(() => {
    const vinculo = new Map((data?.vinculos ?? []).map((v) => [v.persona_id, v]));
    return (equipo.data?.personas ?? []).filter((p) => p.activo).map((p) => ({ p, slack: vinculo.get(p.id) ?? null }));
  }, [equipo.data, data?.vinculos]);
  const sinSlack = personas.filter((x) => !x.slack);

  const canalDe = useMemo(() => new Map((data?.canales ?? []).map((c) => [c.brand_id, c])), [data?.canales]);
  const marcas = useMemo(() => {
    const q = fold(buscar).trim();
    return clients
      .filter((b) => !q || fold(b.name).includes(q))
      .sort((a, b) => Number(canalDe.has(b.id)) - Number(canalDe.has(a.id)) || a.name.localeCompare(b.name));
  }, [clients, buscar, canalDe]);

  return (
    <div className="min-h-screen">
      <ContextBar>
        <BoardNav />
        <BarDivider />
        <BarSearch value={buscar} onChange={setBuscar} placeholder="Buscar una marca" />
        {conexion ? (
          <>
            <BarDivider />
            <BarButton
              label="Volver a cruzar la gente del Slack con el equipo"
              icon={ocupado === "vincular" ? Loader2 : UserPlus}
              className={cn(ocupado === "vincular" && "[&>svg]:animate-spin")}
              disabled={Boolean(ocupado)}
              onClick={() =>
                correr(
                  "vincular",
                  () => pedirSlack<{ vinculadas: number; sinSlack: string[] }>("/api/slack", { body: { accion: "vincular" } }),
                  (r) => `${r.vinculadas} vinculadas${r.sinSlack.length ? ` · ${r.sinSlack.length} sin Slack` : ""}`
                )
              }
            />
          </>
        ) : (
          configurado && (
            <>
              <BarDivider />
              <BarAction label="Conectar Slack" icon={SlackIcon} onClick={conectar} compact={false}>
                Conectar Slack
              </BarAction>
            </>
          )
        )}
      </ContextBar>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-6 text-center">
          <h1 className="font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">Slack</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            El bot del estudio: avisa los cumpleaños, manda a cada uno lo que pidió en su perfil y tiene un canal por marca para lo del cliente y los avisos al equipo.
          </p>
        </div>

        {sinMigracion ? (
          <p className="rounded-2xl bg-primary/20 p-4 text-center text-sm">
            Falta correr <code className="rounded bg-foreground/10 px-1 text-[12px]">supabase/migracion-slack.sql</code> en Supabase.
          </p>
        ) : error ? (
          <p className="rounded-2xl bg-primary/20 p-4 text-center text-sm">{error}</p>
        ) : !loaded || !data ? (
          <div className="skeleton h-48 rounded-3xl" />
        ) : (
          <div className="space-y-4">
            {/* Conexión */}
            <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-2.5">
                <SlackIcon className="h-5 w-5" />
                <h2 className="flex-1 text-base font-semibold">Slack del estudio</h2>
                {conexion && (
                  <span className="flex items-center gap-3">
                    <button type="button" onClick={conectar} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                      Volver a conectar
                    </button>
                    <button type="button" onClick={desconectar} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-destructive hover:underline">
                      Desconectar
                    </button>
                  </span>
                )}
              </div>
              {conexion ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Conectado a <span className="font-medium text-foreground">{conexion.team_nombre ?? conexion.team_id}</span>
                  {conexion.dominio ? ` (${conexion.dominio}.slack.com)` : ""}
                  {conexion.conectada_por ? ` por ${conexion.conectada_por}` : ""} · {hace(conexion.conectada)}.
                </p>
              ) : configurado ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Todavía no está conectado. Tocá <span className="font-medium text-foreground">Conectar Slack</span> y aceptá con una cuenta que pueda instalar apps en el Slack del estudio.
                </p>
              ) : (
                <Preparar />
              )}
              {conexion && !data.listo.cron && (
                <p className="mt-3 flex items-start gap-2 rounded-2xl bg-primary/20 px-3 py-2 text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Falta <code className="rounded bg-foreground/10 px-1">CRON_SECRET</code> en Vercel: sin eso no corre el aviso de cada mañana (los cumpleaños y los resúmenes). Lo demás anda igual.
                </p>
              )}
            </section>

            {conexion && (
              <>
                {/* Canal del estudio */}
                <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
                  <h2 className="text-base font-semibold">El aviso de cada mañana</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tipo 8 a 9 de la mañana sale en este canal quién cumple años y quién está fuera de oficina. A los compañeros del que cumple les llega además un privado con el link para saludarlo, y a quien lo pidió, su resumen del día.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Select
                      value={conexion.canal_estudio?.id ?? "__ninguno"}
                      onValueChange={(v) => {
                        const c = canales?.find((x) => x.id === v);
                        correr(
                          "estudio",
                          () => pedirSlack("/api/slack", { body: { accion: "canal_estudio", canal_id: v === "__ninguno" ? null : v, nombre: c?.nombre ?? null } }),
                          () => (v === "__ninguno" ? "Sin canal del estudio" : `El aviso sale en #${c?.nombre}`)
                        );
                      }}
                      disabled={!canales || Boolean(ocupado)}
                    >
                      <SelectTrigger className="h-9 w-64">
                        <SelectValue placeholder={canales ? "Elegir el canal" : "Cargando canales…"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__ninguno">Ninguno (solo los privados)</SelectItem>
                        {conexion.canal_estudio && !canales?.some((c) => c.id === conexion.canal_estudio!.id) && (
                          <SelectItem value={conexion.canal_estudio.id}>#{conexion.canal_estudio.nombre}</SelectItem>
                        )}
                        {(canales ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            #{c.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      disabled={Boolean(ocupado)}
                      onClick={() =>
                        correr(
                          "probar",
                          () =>
                            pedirSlack<{ estudio: boolean; cumples: number; saludos: number; resumenes: number; errores: string[]; cola: { enviados: number } }>(
                              "/api/slack",
                              { body: { accion: "probar" } }
                            ),
                          (r) =>
                            r.errores.length
                              ? `Salió con errores: ${r.errores[0]}`
                              : `Hoy: ${r.cumples} cumpleaños · ${r.saludos} privados · ${r.resumenes} resúmenes${r.estudio ? " · aviso en el canal" : ""}${r.cola.enviados ? ` · ${r.cola.enviados} de la cola` : ""}`
                        )
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-[13px] font-medium shadow-sm transition-colors hover:border-foreground/30 disabled:opacity-50"
                    >
                      {ocupado === "probar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Mandar lo de hoy ahora
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    &quot;Mandar lo de hoy ahora&quot; no repite lo que ya salió hoy: sirve para probar o si la tarea de la mañana no corrió.
                  </p>
                </section>

                {/* Personas */}
                <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
                  <div className="flex items-center gap-2">
                    <h2 className="flex-1 text-base font-semibold">Gente vinculada</h2>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {personas.length - sinSlack.length} de {personas.length} activos
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Se cruza por el mail: el de Slack tiene que ser el mismo que el del Board. Si alguien entró hace poco a Slack, tocá{" "}
                    <RefreshCw className="inline h-3.5 w-3.5" /> arriba (volver a cruzar).
                  </p>
                  {sinSlack.length > 0 && (
                    <div className="mt-3">
                      <p className="eyebrow mb-1.5">Sin Slack ({sinSlack.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {sinSlack.map(({ p }) => (
                          <span key={p.id} title={p.email ?? undefined} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                            {p.nombre}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* Canales por marca */}
                <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
                  <div className="px-4 pb-3 pt-4 sm:px-5">
                    <h2 className="text-base font-semibold">Canal de cada marca</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Al crear o vincular el canal, el bot invita al equipo de la marca (los designados, la gente del hub y sus directores). Ahí llega lo que comenta o aprueba el cliente en la presentación compartida y lo que le escriba el estudio al equipo desde Clientes.
                    </p>
                  </div>
                  <ul className="divide-y border-t">
                    {marcas.map((b) => (
                      <FilaMarca
                        key={b.id}
                        marca={b}
                        canal={canalDe.get(b.id) ?? null}
                        canales={canales}
                        dominio={conexion.dominio}
                        teamId={conexion.team_id}
                        ocupado={ocupado}
                        correr={correr}
                        onCanalNuevo={cargarCanales}
                      />
                    ))}
                    {!marcas.length && <li className="p-8 text-center text-sm text-muted-foreground">Ninguna marca coincide.</li>}
                  </ul>
                </section>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

type Correr = <T>(clave: string, fn: () => Promise<T>, ok?: (r: T) => string | null) => Promise<T | null>;

function FilaMarca({
  marca,
  canal,
  canales,
  dominio,
  teamId,
  ocupado,
  correr,
  onCanalNuevo,
}: {
  marca: Brand;
  canal: { canal_id: string; canal_nombre: string; avisos: boolean } | null;
  canales: CanalSlack[] | null;
  dominio: string | null;
  teamId: string | null;
  ocupado: string | null;
  correr: Correr;
  onCanalNuevo: () => void;
}) {
  const [nombre, setNombre] = useState(slug(marca.name));
  const clave = `marca:${marca.id}`;
  const url = dominio ? `https://${dominio}.slack.com/archives/${canal?.canal_id}` : teamId ? `https://app.slack.com/client/${teamId}/${canal?.canal_id}` : null;
  const resultado = (r: { canal: { nombre: string }; invitados: number; sinSlack: string[] }) =>
    `#${r.canal.nombre}: ${r.invitados} ${r.invitados === 1 ? "invitado" : "invitados"}${r.sinSlack.length ? ` · sin Slack: ${r.sinSlack.join(", ")}` : ""}`;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
      <ClientMark brand={marca} className="h-8 w-8 shrink-0 rounded-lg" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{marca.name}</span>
      {canal ? (
        <>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium underline-offset-2 hover:underline">
              <Hash className="h-3.5 w-3.5" />
              {canal.canal_nombre}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 text-[13px] font-medium">
              <Hash className="h-3.5 w-3.5" />
              {canal.canal_nombre}
            </span>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Avisar en el canal lo que hace el cliente en la presentación compartida">
            <Switch
              checked={canal.avisos}
              onCheckedChange={(on) =>
                correr(clave, () => pedirSlack("/api/slack/canales", { method: "PATCH", body: { brand_id: marca.id, avisos: on } }), () =>
                  on ? "Lo del cliente llega al canal" : "Lo del cliente ya no llega al canal"
                )
              }
              aria-label={`Avisos del cliente en #${canal.canal_nombre}`}
            />
            Cliente
          </label>
          <button
            type="button"
            title="Invitar de nuevo al equipo de la marca (si cambió la gente)"
            disabled={Boolean(ocupado)}
            onClick={() => correr(clave, () => pedirSlack<Parameters<typeof resultado>[0]>("/api/slack/canales", { body: { brand_id: marca.id, invitar: true } }), resultado)}
            className="grid h-8 w-8 place-items-center rounded-full border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
          >
            {ocupado === clave ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          </button>
          <button
            type="button"
            title="Desvincular el canal (queda en Slack)"
            disabled={Boolean(ocupado)}
            onClick={() => correr(clave, () => pedirSlack(`/api/slack/canales?brand_id=${marca.id}`, { method: "DELETE" }), () => `${marca.name} quedó sin canal`)}
            className="grid h-8 w-8 place-items-center rounded-full border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-destructive disabled:opacity-50"
          >
            <Unlink className="h-4 w-4" />
          </button>
        </>
      ) : (
        <>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={Boolean(ocupado)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {ocupado === clave ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Crear canal
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-2">
              <p className="eyebrow">Canal nuevo para {marca.name}</p>
              <div className="flex items-center gap-1 rounded-md border bg-card px-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <input
                  value={nombre}
                  onChange={(e) => setNombre(slug(e.target.value) || e.target.value.toLowerCase())}
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
                  aria-label="Nombre del canal"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Minúsculas, números y guiones. Si ya existe uno con ese nombre, se usa ese.</p>
              <PopoverClose asChild>
                <button
                  type="button"
                  disabled={!slug(nombre)}
                  onClick={() =>
                    correr(clave, () => pedirSlack<Parameters<typeof resultado>[0]>("/api/slack/canales", { body: { brand_id: marca.id, nombre: slug(nombre) } }), (r) => {
                      onCanalNuevo();
                      return resultado(r);
                    })
                  }
                  className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-primary text-xs font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Crear e invitar al equipo
                </button>
              </PopoverClose>
            </PopoverContent>
          </Popover>
          <Select
            value=""
            onValueChange={(v) =>
              correr(clave, () => pedirSlack<Parameters<typeof resultado>[0]>("/api/slack/canales", { body: { brand_id: marca.id, canal_id: v } }), resultado)
            }
            disabled={!canales || Boolean(ocupado)}
          >
            <SelectTrigger className="h-8 w-40 rounded-full text-xs" aria-label={`Vincular un canal existente a ${marca.name}`}>
              <SelectValue placeholder="Usar uno existente" />
            </SelectTrigger>
            <SelectContent>
              {(canales ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  #{c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
    </li>
  );
}

/** Lo que hay que hacer una sola vez para que el bot exista (crear la app de Slack y cargar sus claves). */
function Preparar() {
  const [copiado, setCopiado] = useState(false);
  const origen = typeof window === "undefined" ? "https://tu-app.vercel.app" : window.location.origin;
  const manifiesto = JSON.stringify(manifiestoSlack(origen), null, 2);
  return (
    <div className="mt-2 space-y-2 text-sm text-muted-foreground">
      <p>Para conectar Slack falta crear la app del estudio (una sola vez):</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          En <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-2 hover:underline">api.slack.com/apps</a> →{" "}
          <span className="text-foreground">Create New App → From a manifest</span>, elegí el Slack del estudio y pegá el manifiesto de abajo.
        </li>
        <li>
          En <span className="text-foreground">Basic Information</span> copiá el <span className="text-foreground">Client ID</span> y el <span className="text-foreground">Client Secret</span> y cargalos en Vercel como{" "}
          <code className="rounded bg-foreground/10 px-1 text-[12px]">SLACK_CLIENT_ID</code> y <code className="rounded bg-foreground/10 px-1 text-[12px]">SLACK_CLIENT_SECRET</code> (y{" "}
          <code className="rounded bg-foreground/10 px-1 text-[12px]">INTEGRACIONES_SECRET</code>, si no está). Volvé a hacer el deploy.
        </li>
        <li>Volvé acá y tocá Conectar Slack.</li>
      </ol>
      <div className="relative">
        <pre className="max-h-56 overflow-auto rounded-2xl bg-secondary/70 p-3 text-[11px] leading-relaxed text-foreground">{manifiesto}</pre>
        <button
          type="button"
          onClick={async () => {
            const ok = await copyPlain(manifiesto);
            setCopiado(ok);
            toast(ok ? "Manifiesto copiado" : "No se pudo copiar", ok ? "ok" : "error");
          }}
          className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-full border bg-card px-2.5 text-[11px] font-medium shadow-sm hover:border-foreground/30"
        >
          {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copiar
        </button>
      </div>
      <p className="text-xs">La dirección de vuelta del manifiesto es la de esta página: creá la app desde la URL publicada (producción o testing).</p>
    </div>
  );
}
