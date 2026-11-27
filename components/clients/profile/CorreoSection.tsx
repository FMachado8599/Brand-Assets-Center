"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, AtSign, Check, Globe, Loader2, Mail, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { api, ErrorCorreo, fechaCorta } from "@/lib/correo/cliente";
import { correosCliente, esDominio, normalizarValor, type CorreoDeCliente } from "@/lib/correo/clientesCorreo";
import { nombreDireccion, type MailDeCliente } from "@/lib/correo/types";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Empty, Section, SmallAction } from "./Section";

const CAMPO = "h-10 w-full min-w-0 rounded-xl border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Los mails y dominios del cliente, y tus últimos mails con él. Con las direcciones cargadas, en el
 * Correo cada mail suyo aparece con su logo y se puede filtrar por cliente.
 */
export function CorreoSection({ brand }: { brand: Brand }) {
  const confirm = useConfirm();
  const [lista, setLista] = useState<CorreoDeCliente[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [nombre, setNombre] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLista(await correosCliente.listar(brand.id));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [brand.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function agregar() {
    const n = normalizarValor(valor);
    if ("error" in n) return setAviso(n.error);
    if (lista?.some((c) => c.valor === n.valor)) return setAviso("Ya está cargado.");
    setGuardando(true);
    try {
      const nuevo = await correosCliente.agregar(brand.id, n.valor, n.tipo === "mail" ? nombre : "");
      setLista((l) => [...(l ?? []), nuevo]);
      setValor("");
      setNombre("");
      setAviso(null);
      toast(n.tipo === "dominio" ? `Todos los de @${n.valor} son de ${brand.name}` : "Mail agregado");
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(c: CorreoDeCliente) {
    const ok = await confirm({
      title: `¿Sacar ${esDominio(c.valor) ? `@${c.valor}` : c.valor}?`,
      description: "Sus mails dejan de aparecer con el logo del cliente. Los mails no se tocan.",
      confirmLabel: "Sacar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await correosCliente.borrar(c.id);
      setLista((l) => (l ?? []).filter((x) => x.id !== c.id));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const hay = Boolean(lista?.length);

  return (
    <Section
      id="correo"
      title="Correo"
      hint="Sus mails y dominios: con esto, en el Correo cada mail suyo aparece con su logo y se puede filtrar."
      action={
        hay ? (
          <SmallAction href={`/correo?cliente=${brand.id}`}>
            <Mail /> Ver sus mails
          </SmallAction>
        ) : undefined
      }
    >
      {error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-3">
            <form
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                agregar();
              }}
            >
              <label className="min-w-0 sm:col-span-2">
                <span className="sr-only">Mail o dominio</span>
                <input
                  id={`correo-valor-${brand.id}`}
                  value={valor}
                  onChange={(e) => {
                    setValor(e.target.value);
                    setAviso(null);
                  }}
                  placeholder="ana@cliente.com o cliente.com"
                  autoComplete="off"
                  className={CAMPO}
                />
              </label>
              <label className="min-w-0">
                <span className="sr-only">Quién es (opcional)</span>
                <input
                  id={`correo-nombre-${brand.id}`}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder={valor.includes("@") && !valor.trim().startsWith("@") ? "Quién es (opcional)" : "Quién es (solo si es un mail)"}
                  disabled={!valor.includes("@") || valor.trim().startsWith("@")}
                  maxLength={120}
                  className={cn(CAMPO, "disabled:opacity-50")}
                />
              </label>
              <button
                type="submit"
                disabled={guardando || !valor.trim()}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 disabled:opacity-50"
              >
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Agregar
              </button>
            </form>
            {aviso && <p className="text-sm text-destructive">{aviso}</p>}

            {!lista ? (
              <div className="skeleton h-24 rounded-2xl" />
            ) : !hay ? (
              <Empty>
                Un dominio (<b>cliente.com</b>) marca a todos los de ahí; un mail, a esa persona. Para gmail o hotmail, cargá el mail entero.
              </Empty>
            ) : (
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {lista.map((c) =>
                  editando === c.id ? (
                    <Editar
                      key={c.id}
                      c={c}
                      onCancelar={() => setEditando(null)}
                      onGuardado={(nuevo) => {
                        setLista((l) => (l ?? []).map((x) => (x.id === nuevo.id ? nuevo : x)));
                        setEditando(null);
                      }}
                    />
                  ) : (
                    <li key={c.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                        {esDominio(c.valor) ? <Globe className="h-4 w-4" /> : <AtSign className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{esDominio(c.valor) ? `@${c.valor}` : c.valor}</p>
                        <p className="truncate text-xs text-muted-foreground">{esDominio(c.valor) ? "Todos los de ese dominio" : c.nombre || "Sin nombre"}</p>
                      </div>
                      <Boton label="Editar" onClick={() => setEditando(c.id)}>
                        <Pencil className="h-4 w-4" />
                      </Boton>
                      <Boton label="Sacar" onClick={() => borrar(c)}>
                        <Trash2 className="h-4 w-4" />
                      </Boton>
                    </li>
                  )
                )}
              </ul>
            )}
          </div>

          <UltimosMails brand={brand} hay={hay} version={lista?.length ?? 0} />
        </div>
      )}
    </Section>
  );
}

function Editar({ c, onCancelar, onGuardado }: { c: CorreoDeCliente; onCancelar: () => void; onGuardado: (c: CorreoDeCliente) => void }) {
  const [valor, setValor] = useState(c.valor);
  const [nombre, setNombre] = useState(c.nombre);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const n = normalizarValor(valor);
    if ("error" in n) return setAviso(n.error);
    setGuardando(true);
    try {
      onGuardado(await correosCliente.editar(c.id, { valor: n.valor, nombre: n.tipo === "mail" ? nombre : "" }));
    } catch (e) {
      setAviso((e as Error).message);
      setGuardando(false);
    }
  }

  const esMail = valor.includes("@") && !valor.trim().startsWith("@");
  return (
    <li className="grid gap-2 bg-secondary/40 px-3.5 py-3">
      <form
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
        onKeyDown={(e) => e.key === "Escape" && onCancelar()}
      >
        <input
          id={`correo-editar-valor-${c.id}`}
          aria-label="Mail o dominio"
          autoFocus
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
            setAviso(null);
          }}
          className={cn(CAMPO, "sm:col-span-2")}
        />
        <input
          id={`correo-editar-nombre-${c.id}`}
          aria-label="Quién es"
          value={esMail ? nombre : ""}
          onChange={(e) => setNombre(e.target.value)}
          disabled={!esMail}
          placeholder={esMail ? "Quién es (opcional)" : "Solo para un mail"}
          maxLength={120}
          className={cn(CAMPO, "disabled:opacity-50")}
        />
        <div className="flex items-center gap-1">
          <Boton label="Guardar" type="submit" disabled={guardando}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Boton>
          <Boton label="Cancelar" onClick={onCancelar}>
            <X className="h-4 w-4" />
          </Boton>
        </div>
      </form>
      {aviso && <p className="text-sm text-destructive">{aviso}</p>}
    </li>
  );
}

function Boton({
  label,
  onClick,
  type = "button",
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Tus últimos mails con el cliente (recibidos y enviados), buscados en tu casilla en el momento. */
function UltimosMails({ brand, hay, version }: { brand: Brand; hay: boolean; version: number }) {
  const [mails, setMails] = useState<MailDeCliente[] | null>(null);
  const [error, setError] = useState<{ texto: string; sinCasilla: boolean } | null>(null);

  useEffect(() => {
    if (!hay) return;
    let vivo = true;
    setMails(null);
    setError(null);
    api<{ mails: MailDeCliente[] }>(`/api/correo/cliente?brand=${brand.id}`)
      .then((r) => vivo && setMails(r.mails))
      .catch((e) => {
        if (!vivo) return;
        const sinCasilla = e instanceof ErrorCorreo && (e.codigo === "sin_cuenta" || e.codigo === "auth");
        setError({ texto: (e as Error).message, sinCasilla });
      });
    return () => {
      vivo = false;
    };
  }, [brand.id, hay, version]);

  return (
    <div className="grid content-start gap-2">
      <p className="eyebrow">Tus últimos mails con {brand.name}</p>
      {!hay ? (
        <p className="text-sm text-muted-foreground">Cargá un mail o un dominio y acá aparecen tus mails con ellos.</p>
      ) : error ? (
        <p className="text-sm text-muted-foreground">
          {error.sinCasilla ? (
            <>
              Conectá tu casilla en{" "}
              <Link href="/correo" className="font-medium text-foreground underline underline-offset-2">
                Correo
              </Link>{" "}
              para ver acá tus mails con {brand.name}.
            </>
          ) : (
            error.texto
          )}
        </p>
      ) : !mails ? (
        <div className="grid gap-1.5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-12 rounded-xl" />
          ))}
        </div>
      ) : mails.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tenés mails con ellos en Recibidos ni en Enviados.</p>
      ) : (
        <ul className="grid gap-1">
          {mails.map((m) => {
            const quien = (m.enviado ? m.para : m.de).map(nombreDireccion).join(", ") || "—";
            return (
              <li key={`${m.carpeta}-${m.uid}`}>
                <Link
                  href={`/correo?carpeta=${encodeURIComponent(m.carpeta)}&uid=${m.uid}`}
                  className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-secondary/60"
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full",
                      m.enviado ? "bg-secondary text-muted-foreground" : "bg-primary/30 text-foreground"
                    )}
                    title={m.enviado ? "Lo mandaste vos" : "Te lo mandaron"}
                  >
                    {m.enviado ? <Send className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-sm", !m.leido && !m.enviado && "font-semibold")}>
                        {m.enviado && <span className="text-muted-foreground">Para: </span>}
                        {quien}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fechaCorta(m.fecha)}</span>
                    </span>
                    <span className="block truncate text-[13px] text-muted-foreground">{m.asunto || "(Sin asunto)"}</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
