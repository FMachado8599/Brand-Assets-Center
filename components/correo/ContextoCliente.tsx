"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Presentation, SquareKanban, Users, X } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { useContactos, type ClienteDeMail } from "@/lib/correo/contactos";
import { contextoDe, ordenarPorAsunto, type Contexto } from "@/lib/correo/contexto";
import { ETAPA_LABEL } from "@/lib/plani/basecamp";
import { estadoInfo, MESES } from "@/lib/plani/config";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";

/** Cuántas tareas se muestran de entrada (las más parecidas al asunto primero). */
const TAREAS = 3;

const hoyISO = () => new Date().toLocaleDateString("en-CA");

function vence(iso: string | null) {
  if (!iso) return null;
  const dia = iso.slice(0, 10);
  const d = new Date(`${dia}T12:00:00`);
  const texto = d.toLocaleDateString("es-UY", { day: "numeric", month: "short" });
  return { texto, vencida: dia < hoyISO() };
}

/**
 * El cliente del mail, a mano mientras lo leés: sus tareas abiertas en Basecamp (la del asunto primero),
 * sus presentaciones de este mes y el que viene y quién del equipo lleva la marca. Se prende y se apaga
 * desde la barra del mail; la elección queda guardada en tu cuenta.
 */
export function ContextoCliente({ cliente, asunto, onCerrar }: { cliente: ClienteDeMail; asunto: string; onCerrar: () => void }) {
  const [datos, setDatos] = useState<{ id: string; c: Contexto } | null>(null);
  const [todas, setTodas] = useState(false);

  useEffect(() => {
    let vivo = true;
    setTodas(false);
    contextoDe(cliente.id)
      .then((c) => vivo && setDatos({ id: cliente.id, c }))
      .catch(() => vivo && setDatos({ id: cliente.id, c: { tareas: [], presentaciones: [], equipo: [] } }));
    return () => {
      vivo = false;
    };
  }, [cliente.id]);

  const c = datos?.id === cliente.id ? datos.c : null;
  const equipo = useContactos(c ? c.equipo.flatMap((d) => (d.email ? [d.email] : [])) : []);
  const tareas = c ? ordenarPorAsunto(c.tareas, asunto) : [];
  const visibles = todas ? tareas : tareas.slice(0, TAREAS);

  return (
    <section aria-label={`Contexto de ${cliente.name}`} className="mx-5 mb-4 rounded-2xl border bg-background/50 p-3.5 sm:mx-6">
      <header className="flex items-center gap-2.5">
        <ClientMark brand={cliente} className="h-7 w-7 rounded-full" pad="p-[12%]" />
        <Link href={`/clientes/${cliente.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline">
          {cliente.name}
        </Link>
        <button
          type="button"
          aria-label="Ocultar el contexto"
          title="Ocultar el contexto (se vuelve a prender desde la barra)"
          onClick={onCerrar}
          className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {!c ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-3 grid gap-4 text-[13px] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <Titulo icon={SquareKanban}>
              {c.tareas.length ? `${c.tareas.length} ${c.tareas.length === 1 ? "tarea abierta" : "tareas abiertas"}` : "Tareas"}
            </Titulo>
            {tareas.length === 0 ? (
              <p className="text-muted-foreground">No tiene tareas abiertas en Basecamp.</p>
            ) : (
              <ul className="grid gap-1">
                {visibles.map(({ tarea: t, coincide }) => {
                  const v = vence(t.vence);
                  const etapa = t.columna?.estado ? ETAPA_LABEL[t.columna.estado] : t.columna?.nombre;
                  return (
                    <li key={t.id}>
                      <a
                        href={t.app_url ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "group flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary/70",
                          coincide && "bg-primary/20"
                        )}
                        title={coincide ? "Se parece al asunto del mail" : undefined}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 font-medium leading-snug">{t.titulo}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {etapa && <span>{etapa}</span>}
                            {t.sector && <span>· {t.sector}</span>}
                            {v && <span className={cn(v.vencida && "font-medium text-destructive")}>· {v.vencida ? "Venció" : "Vence"} {v.texto}</span>}
                          </span>
                        </span>
                        {t.personas.length > 0 && (
                          <span className="flex shrink-0 -space-x-1.5 pt-0.5">
                            {t.personas.slice(0, 3).map((p) =>
                              p.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={p.id} src={p.avatar_url} alt={p.nombre} title={p.nombre} className="h-5 w-5 rounded-full object-cover ring-2 ring-card" />
                              ) : null
                            )}
                          </span>
                        )}
                        <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            {tareas.length > TAREAS && (
              <button type="button" onClick={() => setTodas((x) => !x)} className="mt-1 px-2 text-xs font-medium underline underline-offset-2">
                {todas ? "Ver menos" : `Ver las ${tareas.length}`}
              </button>
            )}
          </div>

          <div className="grid min-w-0 content-start gap-4">
            <div>
              <Titulo icon={Presentation}>Presentaciones</Titulo>
              {c.presentaciones.length === 0 ? (
                <p className="text-muted-foreground">Nada de este mes ni del que viene.</p>
              ) : (
                <ul className="grid gap-1">
                  {c.presentaciones.map((p) => {
                    const info = estadoInfo(p.estado);
                    const piezas = p.presentacion_piezas ?? [];
                    const aprobadas = piezas.filter((x) => x.estado_cliente === "aprobada").length;
                    const cambios = piezas.filter((x) => x.estado_cliente === "cambios").length;
                    return (
                      <li key={p.id}>
                        <Link href={`/presentaciones/${p.id}`} className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary/70">
                          <span className="block truncate font-medium">{p.titulo || `${MESES[p.mes - 1]} ${p.anio}`}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: info.color }} />
                              {info.label}
                            </span>
                            {piezas.length > 0 && (
                              <span>
                                · {aprobadas}/{piezas.length} aprobadas
                              </span>
                            )}
                            {cambios > 0 && <span className="font-medium text-foreground">· {cambios} con cambios</span>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {c.equipo.length > 0 && (
              <div>
                <Titulo icon={Users}>Lleva la marca</Titulo>
                <ul className="grid gap-1.5 px-2">
                  {c.equipo.map((d) => (
                    <li key={`${d.sector}-${d.nombre}`} className="flex items-center gap-2">
                      <Avatar
                        d={{ nombre: d.nombre, email: d.email ?? d.nombre }}
                        contacto={d.email ? equipo.get(d.email) : null}
                        className="h-6 w-6 text-[11px]"
                      />
                      <span className="min-w-0 flex-1 truncate">{d.nombre}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{d.sector}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Titulo({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <p className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </p>
  );
}
