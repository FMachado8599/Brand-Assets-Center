"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight, Check, Copy, History, Link2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { BarAction, BarButton, BarDivider, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { toast } from "@/components/ui/toaster";
import { useBasecampSync } from "@/hooks/useBasecampSync";
import { useEquipo } from "@/hooks/useEquipo";
import { conectarUrl, useIntegraciones } from "@/hooks/useIntegraciones";
import type { BoardResumen } from "@/lib/board/tipos";
import { pideReconectar } from "@/lib/integraciones/reconectar";
import { fold } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { BasecampGlyph, BasecampMark, BoardNav, hace } from "./comun";

const numero = (n: number) => n.toLocaleString("es-UY");

/**
 * La pestaña Basecamp del Board (solo admins): la conexión del estudio, la sincronización y lo que
 * hay de cada proyecto.
 *
 * Hay dos cuentas de Basecamp distintas: la del estudio, que autoriza un admin de Basecamp y trae
 * todo, y la personal de cada uno (su persona de Basecamp, por su mail), de donde salen sus tareas y
 * sus notificaciones. Si quien administra la app no es admin de Basecamp, genera un link para que
 * uno autorice con su cuenta sin entrar a la app.
 */
export function BasecampView() {
  const { data, error, sinMigracion, loaded } = useIntegraciones();
  const sync = useBasecampSync();
  const [resumen, setResumen] = useState<BoardResumen | null>(null);
  const [resumenError, setResumenError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [recienConectado, setRecienConectado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/board/resumen", { cache: "no-store" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `Error ${r.status}`);
      setResumen(body as BoardResumen);
      setResumenError(null);
    } catch (e) {
      setResumenError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Al terminar una sincronización se vuelve a contar (y el aviso de recién conectado ya cumplió).
  const corria = useRef(false);
  useEffect(() => {
    if (corria.current && !sync.corriendo) {
      cargar();
      setRecienConectado(false);
    }
    corria.current = sync.corriendo;
  }, [sync.corriendo, cargar]);

  // La vuelta de 37signals llega con ?basecamp=conectado o ?basecamp=error&motivo=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resultado = params.get("basecamp");
    if (!resultado) return;
    if (resultado === "conectado") {
      toast("Basecamp conectado");
      setRecienConectado(true);
    } else {
      toast(`Basecamp: ${params.get("motivo") ?? "no se pudo conectar"}`, "error");
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const bc = data?.basecamp ?? null;
  const persona = bc?.datos?.persona ?? null;
  const email = bc?.datos?.email ?? null;
  const adminBasecamp = bc?.datos?.admin_basecamp;
  const configurado = Boolean(data?.listo.basecamp && data?.listo.secreto);
  const conectar = () => {
    window.location.href = conectarUrl("basecamp");
  };

  const proyectos = useMemo(() => {
    const lista = resumen?.proyectos ?? [];
    const q = fold(buscar).trim();
    const filtrados = q ? lista.filter((p) => fold(p.nombre).includes(q) || (p.cliente && fold(p.cliente.name).includes(q))) : lista;
    // Los activos primero; los archivados quedan al final.
    return [...filtrados].sort((a, b) => Number(a.estado !== "active") - Number(b.estado !== "active"));
  }, [resumen, buscar]);

  const totales = resumen?.totales;

  return (
    <div className="min-h-screen">
      <ContextBar>
        <BoardNav />
        <BarDivider />
        <BarSearch value={buscar} onChange={setBuscar} placeholder="Buscar un proyecto" />
        {bc && (
          <>
            <BarDivider />
            <BarButton label="Actualizar (solo lo que cambió)" icon={RefreshCw} onClick={sync.sincronizar} disabled={sync.corriendo} />
            <BarAction label="Traer todo" icon={sync.corriendo ? Loader2 : History} onClick={sync.sincronizarTodo} disabled={sync.corriendo} className={cn(sync.corriendo && "[&>svg]:animate-spin")}>
              {sync.corriendo ? sync.pasoNombre ?? "Sincronizando" : "Traer todo"}
            </BarAction>
          </>
        )}
        {!bc && configurado && (
          <>
            <BarDivider />
            <BarAction label="Conectar Basecamp" icon={BasecampGlyph} onClick={conectar} compact={false}>
              Conectar Basecamp
            </BarAction>
          </>
        )}
      </ContextBar>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-6 text-center">
          <h1 className="font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">Basecamp</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            La cuenta del estudio conectada, la sincronización y lo que hay de cada proyecto.
          </p>
        </div>

        {/* Conexión */}
        <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2.5">
            <BasecampMark className="h-6 w-6" />
            <h2 className="flex-1 text-base font-semibold">Basecamp del estudio</h2>
            {bc && (
              <a href={conectarUrl("basecamp")} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Conectar con mi cuenta de Basecamp
              </a>
            )}
          </div>

          {!loaded ? (
            <div className="skeleton mt-3 h-16 rounded-xl" />
          ) : error || !data ? (
            <p className="mt-3 rounded-xl bg-primary/20 p-3 text-sm">
              {sinMigracion ? (
                <>
                  Falta correr <code className="rounded bg-foreground/10 px-1 text-[12px]">supabase/migracion-integraciones.sql</code> en esta base de Supabase.
                </>
              ) : (
                error
              )}
            </p>
          ) : !configurado ? (
            <p className="mt-3 rounded-xl bg-primary/20 p-3 text-sm">
              Falta configurar en el servidor:{" "}
              {[!data.listo.basecamp && "BASECAMP_CLIENT_ID y BASECAMP_CLIENT_SECRET", !data.listo.secreto && "INTEGRACIONES_SECRET"].filter(Boolean).join(" y ")}.
            </p>
          ) : !bc ? (
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-muted-foreground">
                Todavía no hay ninguna cuenta conectada. Tiene que autorizar un <strong className="font-medium text-foreground">admin de Basecamp</strong>: la
                app ve lo mismo que esa persona. Si sos admin de Basecamp, conectá con tu cuenta; si no, generá un link para uno.
              </p>
              <button type="button" onClick={conectar} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95">
                <BasecampGlyph className="h-4 w-4" /> Conectar con mi cuenta de Basecamp
              </button>
              <LinkAutorizar />
              <TuCuenta />
            </div>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
                <div>
                  <dt className="eyebrow text-muted-foreground">Autorizó</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                    {persona ?? "—"}
                    {adminBasecamp === true && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-600/12 px-1.5 py-px text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="h-3 w-3" /> Admin de Basecamp
                      </span>
                    )}
                  </dd>
                  {email && <dd className="text-xs text-muted-foreground">{email}</dd>}
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">Basecamp</dt>
                  <dd className="mt-0.5 font-medium">{bc.cuenta_nombre ?? "—"}</dd>
                  <dd className="text-xs text-muted-foreground">Cuenta {bc.cuenta_id}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">Conectada</dt>
                  <dd className="mt-0.5 font-medium">{hace(bc.conectada)}</dd>
                  {bc.conectada_por && (
                    <dd className="text-xs text-muted-foreground">
                      la gestiona {bc.conectada_por}
                      {bc.datos?.por_link ? " · con link" : ""}
                    </dd>
                  )}
                </div>
              </dl>

              {!sync.corriendo && pideReconectar(sync.error ?? data.sync?.ultimo_error) && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-destructive/10 p-3">
                  <p className="min-w-0 flex-1">{sync.error ?? data.sync?.ultimo_error}</p>
                  <button
                    type="button"
                    onClick={conectar}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95"
                  >
                    <BasecampGlyph className="h-4 w-4" /> Volver a conectar
                  </button>
                </div>
              )}

              {adminBasecamp === false && (
                <p className="flex items-start gap-2 rounded-xl bg-primary/25 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {persona ?? "La cuenta que autorizó"} no es admin de Basecamp: la app solo ve los proyectos donde está. Para traer todo, generá un
                    link abajo y mandáselo a un admin de Basecamp.
                  </span>
                </p>
              )}

              {recienConectado && !sync.corriendo && (
                <p className="rounded-xl bg-primary/25 p-3">
                  Revisá que arriba diga el nombre de la persona correcta y apretá <strong>Traer todo</strong>.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/55 p-3">
                <div className="min-w-0 flex-1 text-xs">
                  {sync.corriendo ? (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {sync.pasoNombre}
                      {sync.detalle ? ` · ${sync.detalle}` : "…"}
                    </span>
                  ) : (
                    <>
                      <span className="font-medium">Última sincronización: {hace(data.sync?.ultimo)}</span>
                      {data.sync?.ultimo && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {data.sync.resumen?.completa ? "completa" : "solo lo que cambió"}
                          {data.sync.resumen?.requests ? ` · ${numero(data.sync.resumen.requests)} pedidos a Basecamp` : ""}
                        </span>
                      )}
                      {data.sync?.ultimo && (
                        <span className="mt-1 block text-muted-foreground">
                          {data.sync.resumen?.webhooks != null
                            ? `Avisos al instante (notificaciones y Board al día) en ${numero(data.sync.resumen.webhooks)} proyectos.`
                            : (data.sync.resumen?.webhooksAviso ?? "Avisos al instante: todavía no se activaron.")}
                        </span>
                      )}
                      {(sync.error || data.sync?.ultimo_error) && !pideReconectar(sync.error ?? data.sync?.ultimo_error) && (
                        <span className="mt-1 block text-destructive">Último error: {sync.error ?? data.sync?.ultimo_error}</span>
                      )}
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={sync.sincronizar}
                  disabled={sync.corriendo}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/[0.08] bg-card px-3 text-xs font-medium hover:bg-secondary disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Actualizar
                </button>
                <button
                  type="button"
                  onClick={sync.sincronizarTodo}
                  disabled={sync.corriendo}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-50"
                >
                  {sync.corriendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />} Traer todo
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong className="font-medium text-foreground">Traer todo</strong> lee todas las tareas de todos los proyectos (unos minutos la primera vez).{" "}
                <strong className="font-medium text-foreground">Actualizar</strong> trae solo lo que cambió. Solo llega lo que ve la cuenta conectada.
              </p>
              <LinkAutorizar />
              <TuCuenta />
            </div>
          )}
        </section>

        {/* Lo que hay */}
        {resumenError && !sinMigracion && <p className="mt-4 rounded-xl bg-primary/20 p-3 text-sm">{resumenError}</p>}
        {totales && (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Proyectos", value: numero(totales.proyectos), sub: totales.archivados ? `${totales.archivados} archivados` : "activos" },
              { label: "Personas", value: numero(totales.personas), sub: "en la cuenta" },
              { label: "Tableros", value: numero(totales.tableros), sub: "uno por sector" },
              { label: "Tareas", value: numero(totales.tareas), sub: `${numero(totales.abiertas)} abiertas` },
              {
                label: "Gente por proyecto",
                value: totales.miembros === null ? "—" : numero(totales.miembros),
                sub: totales.miembros === null ? "falta migracion-board.sql" : "asignaciones",
              },
            ].map((s) => (
              <li key={s.label} className="rounded-2xl border bg-card/80 p-4">
                <p className="eyebrow text-muted-foreground">{s.label}</p>
                <p className="mt-1 font-display text-3xl leading-none tabular-nums">{s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
              </li>
            ))}
          </ul>
        )}

        {resumen && (
          <section className="mt-4 overflow-hidden rounded-3xl border bg-card shadow-sm">
            {proyectos.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {resumen.proyectos.length ? "Ningún proyecto coincide con la búsqueda." : "Todavía no se trajo nada de Basecamp."}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/40 text-left">
                  <tr className="eyebrow text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Proyecto</th>
                    <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Cliente</th>
                    <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Sectores</th>
                    <th className="px-4 py-2.5 text-right font-medium">Tareas</th>
                    <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Gente</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {proyectos.map((p) => (
                    <tr key={p.id} className={cn(p.estado !== "active" && "text-muted-foreground")}>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5">
                          {p.app_url ? (
                            <a href={p.app_url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 font-medium hover:underline">
                              {p.nombre}
                              <ArrowUpRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
                            </a>
                          ) : (
                            <span className="font-medium">{p.nombre}</span>
                          )}
                          {p.estado !== "active" && <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide">archivado</span>}
                        </span>
                      </td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">
                        {p.ignorado ? <span className="text-xs italic text-muted-foreground">no es cliente</span> : (p.cliente?.name ?? "—")}
                      </td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums md:table-cell">{p.tableros}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {numero(p.abiertas)}
                        <span className="text-muted-foreground"> / {numero(p.tareas)}</span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">{p.miembros ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="border-t bg-secondary/40 px-4 py-2.5 text-xs text-muted-foreground">
              Tareas: abiertas / total. Cada proyecto activo queda vinculado a un cliente con el mismo nombre (o se crea).
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * El link para que un admin de Basecamp autorice la conexión del estudio con su cuenta, sin entrar a
 * la app. Vale 24 h y una sola vez; generar otro invalida el anterior.
 */
function LinkAutorizar() {
  const [link, setLink] = useState<{ url: string; vence: string } | null>(null);
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const generar = async () => {
    setGenerando(true);
    try {
      const r = await fetch("/api/integraciones/basecamp/invitacion", { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `Error ${r.status}`);
      setLink(body as { url: string; vence: string });
      setCopiado(false);
    } catch (e) {
      toast(`Basecamp: ${(e as Error).message}`, "error");
    } finally {
      setGenerando(false);
    }
  };

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiado(true);
      toast("Link copiado");
    } catch {
      toast("No se pudo copiar: seleccionalo y copialo a mano", "error");
    }
  };

  return (
    <div className="rounded-xl border border-dashed p-3">
      <p className="font-medium">Link para un admin de Basecamp</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Mandáselo a un admin de Basecamp: lo abre, autoriza con su cuenta y listo, no necesita entrar a la app. Desde ahí la app trae todo
        y se mantiene al día sola. Vale 24 h y una sola vez, y reemplaza la conexión actual.
      </p>
      {link ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Link para autorizar Basecamp"
            className="h-9 min-w-0 flex-1 rounded-full border bg-background px-3 text-xs"
          />
          <button
            type="button"
            onClick={copiar}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background hover:opacity-90"
          >
            {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copiado ? "Copiado" : "Copiar"}
          </button>
          <span className="w-full text-[11px] text-muted-foreground">
            Vence: {fechaHora(link.vence)} · Si generás otro, este deja de servir.
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={generar}
          disabled={generando}
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/[0.08] bg-card px-3 text-xs font-medium hover:bg-secondary disabled:opacity-50"
        >
          {generando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Generar link
        </button>
      )}
    </div>
  );
}

/** La cuenta personal de quien mira: distinta de la del estudio. De ahí salen sus tareas y notificaciones. */
function TuCuenta() {
  const { data } = useEquipo();
  const yo = data?.yo;
  if (!yo) return null;
  const mia = yo.bc_persona_id != null ? data.personas.find((p) => p.bc_persona_id === yo.bc_persona_id) : null;
  return (
    <p className="text-xs text-muted-foreground">
      <strong className="font-medium text-foreground">Tu cuenta de Basecamp:</strong>{" "}
      {yo.bc_persona_id != null ? `${mia?.nombre ?? yo.nombre ?? "vos"} (por tu mail)` : "no la encontramos con tu mail"}. De ahí salen tus tareas y
      tus notificaciones; es distinta de la conexión del estudio, que solo trae los datos.
    </p>
  );
}
