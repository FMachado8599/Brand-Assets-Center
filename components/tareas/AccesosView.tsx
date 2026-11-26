"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AtSign, Check, Copy, Globe, Inbox, KeyRound, Link2, Loader2, Mail, Trash2, UserRound, X } from "lucide-react";
import { pedirAuth } from "@/components/auth/piezas";
import { ContextBar } from "@/components/shell/ContextBar";
import { useConfirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { Hint } from "@/components/ui/tooltip";
import { copyPlain } from "@/lib/cards/clipboard";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { AjustesNav } from "./comun";

type Dominio = { domain: string; note: string | null; fijo: boolean };
type MailPermitido = { email: string; note: string | null; tiene_cuenta: boolean; tiene_contrasena: boolean };
type Datos = { dominios: Dominio[]; mails: MailPermitido[]; con_contrasena: string[] };
type LinkGenerado = { email: string; link: string; enviado: boolean; horas: number };
type Pedido = { id: string; email: string; nombre: string; created_at: string; permitido: boolean; ya_tiene_cuenta: boolean; ya_tiene_contrasena: boolean };

/** Los errores de la base, en palabras de la app. */
function mensaje(m: string) {
  if (/accesos_|function .* does not exist|allowed_domains|PGRST202/i.test(m)) return "Falta correr supabase/migracion-acceso-contrasena.sql en Supabase.";
  if (/allowed_domains_domain_check|check constraint/i.test(m)) return "Ese dominio no es válido (ej: agencia.com).";
  return m;
}

/**
 * Ajustes → Accesos (solo admins): quién puede entrar a Herramientas. Dominios enteros (todos los
 * @agencia.com) y mails sueltos. Para entrar con contraseña, cada uno la crea con un link de un solo uso:
 * se genera acá para copiarlo (y, si hay mail configurado, también le llega por mail).
 */
export function AccesosView() {
  const confirm = useConfirm();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [link, setLink] = useState<LinkGenerado | null>(null);
  const [generando, setGenerando] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [resolviendo, setResolviendo] = useState<string | null>(null);

  const cargarPedidos = useCallback(async () => {
    const r = await pedirAuth<{ pedidos?: Pedido[] }>("solicitudes");
    setPedidos(r.pedidos ?? []);
  }, []);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("accesos_listar");
    if (e) setError(mensaje(e.message));
    else {
      setError(null);
      setDatos(data as Datos);
    }
  }, []);

  useEffect(() => {
    cargar();
    cargarPedidos();
    pedirAuth<{ configurado: boolean }>("estado").then((r) => setConfigurado(Boolean(r.configurado)));
  }, [cargar, cargarPedidos]);

  const resolver = async (p: Pedido, accion: "aprobar" | "rechazar") => {
    const ok = await confirm(
      accion === "aprobar"
        ? {
            title: `¿Aprobar a ${p.nombre}?`,
            description: p.ya_tiene_cuenta
              ? `${p.email} ya tiene cuenta${p.ya_tiene_contrasena ? " con contraseña" : " (entra con Google)"}: si aprobás, la contraseña de este pedido pasa a valer para esa cuenta. Aprobá solo si te lo pidió esa persona.`
              : `Va a poder entrar con ${p.email} y la contraseña que eligió. Aprobá solo si sabés que el pedido es de esa persona (no hay mail que lo confirme).`,
            confirmLabel: "Aprobar",
          }
        : { title: `¿Rechazar el pedido de ${p.nombre}?`, description: "Se descarta el pedido y su contraseña.", confirmLabel: "Rechazar", destructive: true }
    );
    if (!ok) return;
    setResolviendo(p.id);
    const r = await pedirAuth<{ ok?: boolean }>("solicitudes", { id: p.id, accion });
    setResolviendo(null);
    if (!r.ok) toast(r.error ?? "No se pudo", "error");
    else toast(accion === "aprobar" ? `${p.nombre} ya puede entrar: avisale` : "Pedido rechazado");
    await Promise.all([cargarPedidos(), cargar()]);
  };

  const hacer = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    const { error: e } = await fn();
    if (e) toast(mensaje(e.message), "error");
    else toast(ok);
    await cargar();
  };

  const generar = async (email: string) => {
    setGenerando(email);
    const r = await pedirAuth<{ link?: string; enviado?: boolean; horas?: number }>("invitar", { email });
    setGenerando(null);
    if (r.error || !r.link) return toast(r.error ?? "No se pudo generar el link", "error");
    setLink({ email, link: r.link, enviado: Boolean(r.enviado), horas: r.horas ?? 72 });
    const copiado = await copyPlain(r.link);
    toast(r.enviado ? `Link copiado y mandado por mail a ${email}` : copiado ? "Link copiado: mandáselo por WhatsApp o Slack" : "Link generado");
    await cargar();
  };

  return (
    <div className="min-h-screen">
      <ContextBar>
        <AjustesNav />
      </ContextBar>
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-6 text-center">
          <h1 className="font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">Accesos</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Quién puede entrar a Herramientas: todos los de un dominio o mails sueltos. Entran con Google o con su mail y una contraseña,
            que crean con un link de un solo uso.
          </p>
        </div>

        {configurado === false && (
          <p className="mb-4 rounded-2xl bg-primary/20 p-4 text-sm">
            El ingreso con contraseña todavía no está configurado en este entorno (faltan las claves del servidor: ver el README, "Entrar con mail y
            contraseña"). Los accesos se pueden cargar igual: sirven para entrar con Google.
          </p>
        )}

        {error ? (
          <p className="rounded-2xl bg-primary/20 p-4 text-center text-sm">{error}</p>
        ) : !datos ? (
          <div className="skeleton h-64 rounded-3xl" />
        ) : (
          <div className="grid gap-4">
            {link && <LinkListo link={link} onCerrar={() => setLink(null)} />}

            {pedidos.length > 0 && (
              <Bloque titulo={`Pedidos para entrar · ${pedidos.length}`} icono={Inbox} hint="Gente que creó su cuenta en /ingresar y espera que la apruebes. Confirmá que es quien dice ser.">
                <ul className="divide-y rounded-2xl border">
                  {pedidos.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.nombre}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.email} · {new Date(p.created_at).toLocaleString("es-UY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </span>
                      <span className="flex-1" />
                      {p.ya_tiene_cuenta && (
                        <span className="rounded-full bg-amber-100 dark:bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:text-amber-200">
                          {p.ya_tiene_contrasena ? "ya tiene cuenta con contraseña" : "ya entra con Google"}
                        </span>
                      )}
                      {!p.permitido && <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">se suma a la lista</span>}
                      <button
                        type="button"
                        disabled={resolviendo === p.id}
                        onClick={() => resolver(p, "aprobar")}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-[12px] font-semibold text-background hover:opacity-90 disabled:opacity-40"
                      >
                        {resolviendo === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Aprobar
                      </button>
                      <Hint label="Rechazar">
                        <button
                          type="button"
                          aria-label={`Rechazar a ${p.nombre}`}
                          disabled={resolviendo === p.id}
                          onClick={() => resolver(p, "rechazar")}
                          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </Hint>
                    </li>
                  ))}
                </ul>
              </Bloque>
            )}

            <Bloque titulo="Dominios" icono={Globe} hint="Todo el que tenga un mail de estos dominios puede entrar.">
              <ul className="divide-y rounded-2xl border">
                {datos.dominios.map((d) => (
                  <li key={d.domain} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="font-medium">@{d.domain}</span>
                    {d.note && <span className="truncate text-sm text-muted-foreground">{d.note}</span>}
                    <span className="flex-1" />
                    {d.fijo ? (
                      <span className="text-xs text-muted-foreground">el estudio · fijo</span>
                    ) : (
                      <Hint label={`Sacar @${d.domain}`}>
                        <button
                          type="button"
                          aria-label={`Sacar @${d.domain}`}
                          onClick={async () => {
                            const ok = await confirm({
                              title: `¿Sacar @${d.domain}?`,
                              description: "Quienes entran con ese dominio ya no van a poder entrar (salvo los que estén como mail suelto).",
                              confirmLabel: "Sacar",
                              destructive: true,
                            });
                            if (ok) hacer(() => supabase.rpc("accesos_quitar_dominio", { p_domain: d.domain }), `@${d.domain} ya no tiene acceso`);
                          }}
                          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </Hint>
                    )}
                  </li>
                ))}
              </ul>
              <Agregar
                placeholder="agencia.com"
                prefijo="@"
                boton="Sumar dominio"
                onAgregar={(valor, nota) =>
                  hacer(() => supabase.rpc("accesos_poner_dominio", { p_domain: valor, p_note: nota }), `@${valor.replace(/^@/, "")} ya puede entrar`)
                }
              />
            </Bloque>

            <Bloque titulo="Mails sueltos" icono={AtSign} hint="Una persona puntual (ej: un freelance con Gmail).">
              {datos.mails.length ? (
                <ul className="divide-y rounded-2xl border">
                  {datos.mails.map((m) => (
                    <li key={m.email} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{m.email}</span>
                        {m.note && <span className="block truncate text-xs text-muted-foreground">{m.note}</span>}
                      </span>
                      <span className="flex-1" />
                      <Estado tiene_cuenta={m.tiene_cuenta} tiene_contrasena={m.tiene_contrasena} />
                      <BotonLink email={m.email} tiene={m.tiene_contrasena} generando={generando === m.email} disabled={!configurado} onGenerar={generar} />
                      <Hint label={`Sacar ${m.email}`}>
                        <button
                          type="button"
                          aria-label={`Sacar ${m.email}`}
                          onClick={async () => {
                            const ok = await confirm({
                              title: `¿Sacar a ${m.email}?`,
                              description: "Ya no va a poder entrar (salvo que su dominio esté permitido). Sus links pendientes dejan de servir.",
                              confirmLabel: "Sacar",
                              destructive: true,
                            });
                            if (ok) hacer(() => supabase.rpc("accesos_quitar_mail", { p_email: m.email }), `${m.email} ya no tiene acceso`);
                          }}
                          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </Hint>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-dashed border-foreground/15 px-4 py-5 text-center text-sm text-muted-foreground">Ninguno todavía.</p>
              )}
              <Agregar
                placeholder="alguien@gmail.com"
                boton="Sumar mail"
                onAgregar={(valor, nota) => hacer(() => supabase.rpc("accesos_poner_mail", { p_email: valor, p_note: nota }), `${valor} ya puede entrar`)}
              />
            </Bloque>

            <Bloque
              titulo="Link para crear la contraseña"
              icono={KeyRound}
              hint="Para alguien de un dominio permitido (o de la lista). Vale 72 horas y sirve una sola vez."
            >
              <LinkParaCualquiera disabled={!configurado} generando={Boolean(generando)} onGenerar={generar} />
              {datos.con_contrasena.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Con contraseña: {datos.con_contrasena.join(", ")}.
                </p>
              )}
            </Bloque>
          </div>
        )}
      </main>
    </div>
  );
}

function Bloque({ titulo, hint, icono: Icono, children }: { titulo: string; hint: string; icono: typeof Globe; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-[1.75rem] border border-foreground/[0.06] bg-card/95 p-5 shadow-[0_1px_2px_hsl(40_30%_20%/0.04),0_18px_40px_-28px_hsl(40_45%_20%/0.3)] sm:p-6">
      <header className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary">
          <Icono className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display text-[1.7rem] leading-none">{titulo}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function Agregar({ placeholder, prefijo, boton, onAgregar }: { placeholder: string; prefijo?: string; boton: string; onAgregar: (valor: string, nota: string) => Promise<void> }) {
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const campo = "h-10 min-w-0 rounded-full border bg-card px-4 text-sm outline-none focus:border-foreground/40";
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valor.trim() || ocupado) return;
        setOcupado(true);
        await onAgregar(valor.trim().toLowerCase(), nota.trim());
        setOcupado(false);
        setValor("");
        setNota("");
      }}
    >
      <label className={cn(campo, "flex flex-1 basis-56 items-center gap-1 px-0 pl-4")}>
        {prefijo && <span className="text-muted-foreground">{prefijo}</span>}
        <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-full min-w-0 flex-1 bg-transparent pr-4 outline-none" />
      </label>
      <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" maxLength={120} aria-label="Nota" className={cn(campo, "flex-1 basis-40")} />
      <button type="submit" disabled={!valor.trim() || ocupado} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40">
        {ocupado && <Loader2 className="h-4 w-4 animate-spin" />} {boton}
      </button>
    </form>
  );
}

function Estado({ tiene_cuenta, tiene_contrasena }: { tiene_cuenta: boolean; tiene_contrasena: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tiene_contrasena ? "bg-emerald-100 dark:bg-emerald-400/15 text-emerald-800 dark:text-emerald-300" : tiene_cuenta ? "bg-secondary" : "border text-muted-foreground"
      )}
    >
      {tiene_contrasena ? <KeyRound className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
      {tiene_contrasena ? "con contraseña" : tiene_cuenta ? "entra con Google" : "todavía no entró"}
    </span>
  );
}

function BotonLink({ email, tiene, generando, disabled, onGenerar }: { email: string; tiene: boolean; generando: boolean; disabled: boolean; onGenerar: (email: string) => void }) {
  return (
    <button
      type="button"
      disabled={disabled || generando}
      onClick={() => onGenerar(email)}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-[12px] font-medium transition-colors hover:border-foreground/30 disabled:opacity-40"
    >
      {generando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
      {tiene ? "Link para cambiarla" : "Link para crearla"}
    </button>
  );
}

function LinkParaCualquiera({ disabled, generando, onGenerar }: { disabled: boolean; generando: boolean; onGenerar: (email: string) => void }) {
  const [email, setEmail] = useState("");
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) onGenerar(email.trim().toLowerCase());
      }}
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="nombre@camaratbwa.com"
        aria-label="Mail"
        className="h-10 min-w-0 flex-1 basis-56 rounded-full border bg-card px-4 text-sm outline-none focus:border-foreground/40"
      />
      <button
        type="submit"
        disabled={disabled || generando || !email.trim()}
        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40"
      >
        {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Generar link
      </button>
    </form>
  );
}

function LinkListo({ link, onCerrar }: { link: LinkGenerado; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="rounded-[1.75rem] border-2 border-primary bg-primary/10 p-5">
      <p className="text-sm font-medium">
        Link para {link.email} · vale {link.horas} horas y sirve una sola vez
        {link.enviado && (
          <span className="ml-2 inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
            <Mail className="h-3.5 w-3.5" /> también le llegó por mail
          </span>
        )}
      </p>
      <div className="mt-3 flex gap-2">
        <input readOnly value={link.link} onFocus={(e) => e.currentTarget.select()} aria-label="Link" className="h-10 min-w-0 flex-1 rounded-full border bg-card px-4 font-mono text-xs outline-none" />
        <button
          type="button"
          onClick={async () => {
            setCopiado(await copyPlain(link.link));
          }}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90"
        >
          {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Mandáselo por un canal privado (WhatsApp, Slack). Quien lo tenga puede crear la contraseña de esa cuenta.{" "}
        <button type="button" onClick={onCerrar} className="font-medium underline-offset-2 hover:underline">
          Listo
        </button>
      </p>
    </div>
  );
}
