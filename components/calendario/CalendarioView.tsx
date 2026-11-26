"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarArrowDown,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Settings2,
  Trash2,
  Video,
} from "lucide-react";
import { abrirPerfil } from "@/components/perfil/abrir";
import { BarAction, BarButton, BarDivider, BarPopover, BarSegmented, ContextBar, PanelTitle } from "@/components/shell/ContextBar";
import { useConfirm } from "@/components/ui/confirm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { useClients } from "@/hooks/useClients";
import { useEquipo } from "@/hooks/useEquipo";
import { conectarUrl, useIntegraciones } from "@/hooks/useIntegraciones";
import { useStoredState } from "@/hooks/useStoredState";
import type { Persona } from "@/lib/board/equipo";
import { cumpleDe, cumpleEn, cumpleHoy } from "@/lib/cumple";
import { fechaCorta, hoyISO, nombreDe } from "@/lib/perfil";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Agendar } from "./Agendar";
import {
  DIAS_SEMANA,
  diasDeEvento,
  fechaLarga,
  grillaDelMes,
  horaDe,
  nombreMes,
  useGoogleRango,
  useTareasRango,
  type EventoEstudio,
  type TareaCal,
} from "./datos";
import { Suscribir } from "./Suscribir";

type Vista = "mias" | "marcas" | "todo";
type Capas = { tareas: boolean; cumples: boolean; reuniones: boolean; feriados: boolean };

type Item =
  | { tipo: "feriado"; nombre: string }
  | { tipo: "cumple"; persona: Persona }
  | { tipo: "reunion"; evento: EventoEstudio }
  | { tipo: "tarea"; tarea: TareaCal; marca: Brand | null };

const ORDEN: Record<Item["tipo"], number> = { feriado: 0, cumple: 1, reunion: 2, tarea: 3 };

const CAPAS: { id: keyof Capas; label: string }[] = [
  { id: "tareas", label: "Entregas de tareas" },
  { id: "reuniones", label: "Reuniones del calendario del estudio" },
  { id: "cumples", label: "Cumpleaños" },
  { id: "feriados", label: "Feriados" },
];

/**
 * /calendario: el mes del estudio en una grilla. Las entregas de las tareas (las tuyas, las de tus
 * marcas o todas), las reuniones del Google Calendar del estudio, los cumpleaños, los feriados y quién
 * está fuera de oficina. Desde acá se agenda (con invitados y Meet) y se saca el link para verlo en
 * Google Calendar u Outlook.
 */
export function CalendarioView() {
  const equipo = useEquipo();
  const { clients } = useClients();
  const integ = useIntegraciones();
  const confirmar = useConfirm();
  const hoy = hoyISO();
  const [mes, setMes] = useState(() => ({ anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) }));
  const [sel, setSel] = useState(hoy);
  const [vista, setVista] = useStoredState<Vista>("calendario:vista", "mias");
  const [capas, setCapas] = useStoredState<Capas>("calendario:capas", { tareas: true, cumples: true, reuniones: true, feriados: true });
  const [agendar, setAgendar] = useState(false);
  const [suscribir, setSuscribir] = useState(false);

  useEffect(() => {
    document.title = "Calendario · Herramientas";
  }, []);

  const { dias, desde, hasta } = useMemo(() => grillaDelMes(mes.anio, mes.mes), [mes]);
  const { tareas } = useTareasRango(desde, hasta, capas.tareas);
  const google = useGoogleRango(desde, hasta);

  const data = equipo.data;
  const yo = data?.yo ?? null;
  const admin = equipo.admin;
  const sinEquipo = Boolean(data && !yo?.equipo_id);
  const vistaReal: Vista = sinEquipo && vista !== "todo" ? "todo" : vista;

  // Tus marcas: donde sos designado, las de tu hub y las de los hubs que dirigís.
  const misMarcas = useMemo(() => {
    const s = new Set<string>();
    if (!data || !yo?.equipo_id) return s;
    const p = data.personas.find((x) => x.id === yo.equipo_id);
    for (const d of data.designaciones) if (d.persona_id === yo.equipo_id) s.add(d.brand_id);
    for (const h of data.hubs) if (h.id === p?.hub_id || h.lideres.includes(yo.equipo_id)) h.marcas.forEach((b) => s.add(b));
    return s;
  }, [data, yo?.equipo_id]);

  const brandPorId = useMemo(() => new Map(clients.map((b) => [b.id, b])), [clients]);

  const esMia = (t: TareaCal) => t.responsable_id === yo?.equipo_id || (yo?.bc_persona_id != null && t.asignados.includes(yo.bc_persona_id));

  const porDia = useMemo(() => {
    const m = new Map<string, Item[]>();
    const sumar = (dia: string, item: Item) => {
      if (dia < desde || dia > hasta) return;
      m.set(dia, [...(m.get(dia) ?? []), item]);
    };
    if (capas.feriados) for (const f of google.datos?.feriados ?? []) sumar(f.fecha, { tipo: "feriado", nombre: f.nombre });
    if (capas.cumples) {
      const anios = [...new Set([Number(desde.slice(0, 4)), Number(hasta.slice(0, 4))])];
      for (const p of data?.personas ?? []) {
        const c = cumpleDe(p);
        if (!c || !p.activo) continue;
        for (const a of anios) sumar(cumpleEn(c, a), { tipo: "cumple", persona: p });
      }
    }
    if (capas.reuniones) for (const e of google.datos?.eventos ?? []) for (const d of diasDeEvento(e)) sumar(d, { tipo: "reunion", evento: e });
    if (capas.tareas) {
      for (const t of tareas ?? []) {
        if (vistaReal === "mias" && !esMia(t)) continue;
        if (vistaReal === "marcas" && !(esMia(t) || (t.brand_id && misMarcas.has(t.brand_id)))) continue;
        sumar(t.fecha, { tipo: "tarea", tarea: t, marca: t.brand_id ? (brandPorId.get(t.brand_id) ?? null) : null });
      }
    }
    for (const [k, v] of m) {
      m.set(
        k,
        v.sort((a, b) => {
          if (ORDEN[a.tipo] !== ORDEN[b.tipo]) return ORDEN[a.tipo] - ORDEN[b.tipo];
          if (a.tipo === "reunion" && b.tipo === "reunion") return Number(b.evento.todoElDia) - Number(a.evento.todoElDia) || a.evento.inicio.localeCompare(b.evento.inicio);
          return 0;
        })
      );
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, capas, google.datos, data, tareas, vistaReal, misMarcas, brandPorId, yo?.equipo_id, yo?.bc_persona_id]);

  // Fuera de oficina: de hoy hasta el día que vuelve (no se sabe desde cuándo).
  const fueraEn = (dia: string) =>
    (data?.personas ?? []).filter((p) => p.activo && p.perfil?.fuera_hasta && dia >= hoy && dia <= p.perfil.fuera_hasta);

  const mover = (n: number) =>
    setMes(({ anio, mes: m }) => {
      const t = new Date(Date.UTC(anio, m - 1 + n, 1));
      return { anio: t.getUTCFullYear(), mes: t.getUTCMonth() + 1 };
    });
  const irAHoy = () => {
    setMes({ anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) });
    setSel(hoy);
  };

  const g = google.datos;
  const puedeAgendar = Boolean(g?.conectado && g?.permiso);

  const cancelar = async (e: EventoEstudio) => {
    const ok = await confirmar({
      title: `¿Cancelar "${e.titulo}"?`,
      description: e.invitados.length ? "Se borra del calendario del estudio y a los invitados les llega el aviso." : "Se borra del calendario del estudio.",
      confirmLabel: "Cancelarla",
      destructive: true,
    });
    if (!ok) return;
    const r = await fetch(`/api/calendario/eventos?id=${encodeURIComponent(e.id)}`, { method: "DELETE" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return toast(body.error ?? "No se pudo cancelar", "error");
    toast("Reunión cancelada");
    google.recargar();
  };

  const itemsSel = porDia.get(sel) ?? [];
  const fueraSel = fueraEn(sel);

  return (
    <div className="min-h-screen">
      <ContextBar>
        <BarButton label="Mes anterior" icon={ChevronLeft} onClick={() => mover(-1)} />
        <button type="button" onClick={irAHoy} className="h-9 rounded-full px-2 text-sm font-semibold capitalize tracking-tight text-cream hover:bg-cream/10" title="Volver a hoy">
          {nombreMes(mes.anio, mes.mes)}
        </button>
        <BarButton label="Mes siguiente" icon={ChevronRight} onClick={() => mover(1)} />
        <BarDivider />
        {!sinEquipo && (
          <BarSegmented<Vista>
            label="Qué entregas mostrar"
            value={vistaReal}
            onChange={setVista}
            options={[
              { value: "mias", label: "Mías" },
              { value: "marcas", label: "Mis marcas" },
              { value: "todo", label: "Todo" },
            ]}
          />
        )}
        <BarPopover label="Qué se ve" icon={Layers} align="end" className="w-72">
          <PanelTitle title="Qué se ve" hint="Se recuerda en tu cuenta." />
          <ul className="space-y-2.5">
            {CAPAS.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                {c.label}
                <Switch checked={capas[c.id]} onCheckedChange={(v) => setCapas({ ...capas, [c.id]: v })} aria-label={c.label} />
              </li>
            ))}
          </ul>
        </BarPopover>
        <BarButton label="Verlo en Google Calendar u Outlook" icon={CalendarArrowDown} onClick={() => setSuscribir(true)} />
        {admin && g?.permiso && <ElegirCalendario actual={g.calendario?.id ?? "primary"} onCambio={google.recargar} />}
        {puedeAgendar && (
          <>
            <BarDivider />
            <BarAction label="Agendar" icon={CalendarPlus} onClick={() => setAgendar(true)}>
              Agendar
            </BarAction>
          </>
        )}
      </ContextBar>

      <main className="mx-auto max-w-6xl px-3 pb-16 pt-[5.5rem] sm:px-6">
        <AvisoGoogle g={g} error={google.error} admin={admin} driveCuenta={integ.data?.google?.cuenta_id ?? null} />

        {/* La grilla del mes */}
        <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="grid grid-cols-7 border-b bg-secondary/40">
            {DIAS_SEMANA.map((d) => (
              <span key={d} className="eyebrow px-2 py-2 text-center text-muted-foreground">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dias.map((dia, i) => {
              const items = porDia.get(dia) ?? [];
              const delMes = Number(dia.slice(5, 7)) === mes.mes;
              const feriado = items.some((x) => x.tipo === "feriado");
              const fuera = fueraEn(dia).length;
              const elegido = dia === sel;
              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => setSel(dia)}
                  className={cn(
                    "group relative flex min-h-[4.25rem] flex-col items-stretch gap-0.5 border-foreground/[0.06] p-1 text-left transition-colors sm:min-h-[7.5rem] sm:p-1.5",
                    i % 7 !== 6 && "border-r",
                    i < 35 && "border-b",
                    !delMes && "bg-secondary/30 text-muted-foreground",
                    i % 7 >= 5 && delMes && "bg-secondary/15",
                    elegido ? "ring-2 ring-inset ring-foreground" : "hover:bg-secondary/50"
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span
                      className={cn(
                        "grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-semibold tabular-nums",
                        dia === hoy && "bg-primary text-primary-foreground",
                        feriado && dia !== hoy && "text-[var(--tono-vencida)]"
                      )}
                    >
                      {Number(dia.slice(8))}
                    </span>
                    {fuera > 0 && (
                      <span className="hidden text-[10px] text-muted-foreground sm:inline" title={`${fuera} fuera de oficina`}>
                        🌴{fuera > 1 ? fuera : ""}
                      </span>
                    )}
                  </span>
                  {/* En la compu, las primeras cosas del día; en el celular, puntitos. */}
                  <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                    {items.slice(0, 3).map((it, j) => (
                      <Chip key={j} item={it} hoy={hoy} dia={dia} />
                    ))}
                    {items.length > 3 && <span className="px-1 text-[11px] font-medium text-muted-foreground">+{items.length - 3} más</span>}
                  </span>
                  {items.length > 0 && (
                    <span className="mt-auto flex flex-wrap gap-0.5 px-0.5 sm:hidden">
                      {items.slice(0, 5).map((it, j) => (
                        <span key={j} className="h-1.5 w-1.5 rounded-full" style={{ background: colorDe(it, hoy, dia) }} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* El día elegido */}
        <section className="mt-4 rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1 font-display text-3xl capitalize leading-none">{fechaLarga(sel)}</h2>
            {puedeAgendar && (
              <button
                type="button"
                onClick={() => setAgendar(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-[13px] font-medium shadow-sm transition-colors hover:border-foreground/30"
              >
                <CalendarPlus className="h-4 w-4" /> Agendar este día
              </button>
            )}
          </div>

          {!itemsSel.length && !fueraSel.length ? (
            <p className="mt-3 text-sm text-muted-foreground">{tareas === null && capas.tareas ? "Cargando…" : "Nada para este día."}</p>
          ) : (
            <ul className="mt-3 divide-y">
              {itemsSel.map((it, j) => (
                <li key={j} className="py-2.5">
                  <Detalle item={it} hoy={hoy} dia={sel} yoEmail={yo?.email ?? null} admin={admin} onCancelar={cancelar} yoId={yo?.equipo_id ?? null} />
                </li>
              ))}
              {fueraSel.length > 0 && (
                <li className="py-2.5 text-sm">
                  <span className="mr-1">🌴</span>
                  <span className="text-muted-foreground">Fuera de oficina: </span>
                  {fueraSel.map((p, k) => (
                    <span key={p.id}>
                      {k > 0 && " · "}
                      <button type="button" onClick={() => abrirPerfil(p.id)} className="font-medium hover:underline">
                        {nombreDe(p.perfil, p.nombre)}
                      </button>
                      <span className="text-muted-foreground"> (hasta el {fechaCorta(p.perfil!.fuera_hasta!)})</span>
                    </span>
                  ))}
                </li>
              )}
            </ul>
          )}
        </section>
      </main>

      <Agendar open={agendar} onClose={() => setAgendar(false)} dia={sel < hoy ? hoy : sel} personas={data?.personas ?? []} marcas={clients} onCreada={google.recargar} />
      <Suscribir open={suscribir} onClose={() => setSuscribir(false)} />
    </div>
  );
}

/** El color de cada cosa (para el puntito del celular y el borde del chip). */
function colorDe(it: Item, hoy: string, dia: string) {
  if (it.tipo === "feriado") return "var(--tono-vencida)";
  if (it.tipo === "cumple") return "#E11D48";
  if (it.tipo === "reunion") return "var(--tono-curso)";
  if (dia < hoy) return "var(--tono-vencida)";
  return it.marca?.color || "var(--tono-neutro)";
}

function Chip({ item: it, hoy, dia }: { item: Item; hoy: string; dia: string }) {
  const base = "truncate rounded-md px-1.5 py-0.5 text-[11px] leading-tight";
  if (it.tipo === "feriado") return <span className={cn(base, "font-medium text-[var(--tono-vencida)]")}>{it.nombre}</span>;
  if (it.tipo === "cumple") return <span className={cn(base, "bg-rose-500/10")}>🎂 {nombreDe(it.persona.perfil, it.persona.nombre).split(" ")[0]}</span>;
  if (it.tipo === "reunion") {
    return (
      <span className={cn(base, "bg-[rgba(86,150,244,0.16)]")}>
        {!it.evento.todoElDia && <span className="font-semibold tabular-nums">{horaDe(it.evento.inicio)} </span>}
        {it.evento.titulo}
      </span>
    );
  }
  const vencida = dia < hoy;
  return (
    <span className={cn(base, "border-l-2 bg-secondary/70", vencida && "text-[var(--tono-vencida)]")} style={{ borderLeftColor: colorDe(it, hoy, dia) }}>
      {it.tarea.titulo || "Tarea"}
    </span>
  );
}

function Detalle({
  item: it,
  hoy,
  dia,
  yoEmail,
  yoId,
  admin,
  onCancelar,
}: {
  item: Item;
  hoy: string;
  dia: string;
  yoEmail: string | null;
  yoId: string | null;
  admin: boolean;
  onCancelar: (e: EventoEstudio) => void;
}) {
  const accion = "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors hover:border-foreground/30";
  if (it.tipo === "feriado") return <p className="text-sm font-medium text-[var(--tono-vencida)]">Feriado: {it.nombre}</p>;

  if (it.tipo === "cumple") {
    const p = it.persona;
    const nombre = nombreDe(p.perfil, p.nombre);
    const esHoy = cumpleHoy(cumpleDe(p), hoy) && dia === hoy;
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>🎂</span>
        <button type="button" onClick={() => abrirPerfil(p.id)} className="font-medium hover:underline">
          {p.id === yoId ? "Tu cumpleaños" : `Cumple ${nombre}`}
        </button>
        {esHoy && p.id !== yoId && (
          <Link href={`/saludar?a=${p.id}`} className={cn(accion, "ml-auto bg-foreground text-background hover:opacity-90")}>
            Saludar
          </Link>
        )}
      </div>
    );
  }

  if (it.tipo === "reunion") {
    const e = it.evento;
    const propia = e.creadoPor && e.creadoPor === yoEmail;
    return (
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <span className="w-14 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{e.todoElDia ? "Todo el día" : horaDe(e.inicio)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{e.titulo}</p>
          <p className="text-xs text-muted-foreground">
            {[
              !e.todoElDia && e.fin ? `hasta las ${horaDe(e.fin)}` : null,
              e.invitados.length ? `${e.invitados.length} ${e.invitados.length === 1 ? "invitado" : "invitados"}` : null,
              e.ubicacion,
              e.creadoPor ? `agendó ${e.creadoPor === yoEmail ? "vos" : e.creadoPor}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          {e.meet && (
            <a href={e.meet} target="_blank" rel="noreferrer" className={cn(accion, "bg-primary text-primary-foreground hover:brightness-95")}>
              <Video className="h-3.5 w-3.5" /> Meet
            </a>
          )}
          {e.link && (
            <a href={e.link} target="_blank" rel="noreferrer" className={accion}>
              Google <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
          {(propia || (admin && e.creadoPor)) && (
            <button type="button" onClick={() => onCancelar(e)} className={cn(accion, "hover:text-destructive")} title="Cancelar la reunión">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
    );
  }

  const t = it.tarea;
  const vencida = t.fecha < hoy;
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorDe(it, hoy, dia) }} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", vencida && "text-[var(--tono-vencida)]")}>📌 {t.titulo || "Tarea"}</p>
        <p className="text-xs text-muted-foreground">
          {[it.marca?.name ?? t.proyecto, t.tablero, t.pausada ? "en pausa" : null, vencida ? "vencida" : null].filter(Boolean).join(" · ")}
        </p>
      </div>
      <span className="flex gap-1.5">
        <Link href={`/board?tarea=${t.id}`} className={accion}>
          Board
        </Link>
        {t.app_url && (
          <a href={t.app_url} target="_blank" rel="noreferrer" className={accion}>
            Basecamp <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
      </span>
    </div>
  );
}

/** Lo que falta para ver las reuniones del calendario del estudio. */
function AvisoGoogle({ g, error, admin, driveCuenta }: { g: ReturnType<typeof useGoogleRango>["datos"]; error: string | null; admin: boolean; driveCuenta: string | null }) {
  if (error) {
    return (
      <p className="mb-3 flex items-start gap-2 rounded-2xl bg-primary/20 px-4 py-2.5 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> El calendario del estudio no respondió: {error}
      </p>
    );
  }
  if (!g || (g.conectado && g.permiso)) return null;
  const texto = !g.conectado
    ? "Para ver y agendar las reuniones del calendario del estudio, un admin tiene que conectar la cuenta de Google del estudio."
    : `La cuenta de Google del estudio${driveCuenta ? ` (${driveCuenta})` : ""} está conectada para el Drive, pero sin el permiso de Google Calendar. Para ver y agendar reuniones, un admin la vuelve a conectar y tilda Calendar.`;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-2.5 text-sm">
      <span className="min-w-0 flex-1 text-muted-foreground">{texto}</span>
      {admin && (
        <a href={conectarUrl("google")} className="inline-flex h-8 items-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:brightness-95">
          {g.conectado ? "Volver a conectar Google" : "Conectar Google"}
        </a>
      )}
    </div>
  );
}

/** Solo admins: qué calendario de la cuenta del estudio usa la app (por defecto, el principal). */
function ElegirCalendario({ actual, onCambio }: { actual: string; onCambio: () => void }) {
  const [lista, setLista] = useState<{ id: string; nombre: string; principal: boolean }[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cargar = async () => {
    if (lista) return;
    const r = await fetch("/api/calendario/calendarios", { cache: "no-store" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return toast(body.error ?? "No se pudieron traer los calendarios", "error");
    setLista(body.calendarios);
  };
  const elegir = async (id: string) => {
    setGuardando(true);
    const r = await fetch("/api/calendario/calendarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const body = await r.json().catch(() => ({}));
    setGuardando(false);
    if (!r.ok) return toast(body.error ?? "No se pudo cambiar", "error");
    toast("Listo: el estudio usa ese calendario");
    onCambio();
  };
  return (
    <BarPopover label="Qué calendario de Google usa el estudio" icon={Settings2} align="end" className="w-80" onOpenChange={(o) => o && cargar()}>
      <PanelTitle title="Calendario del estudio" hint="De la cuenta de Google del estudio. Las reuniones que se agendan desde acá van a ese." />
      {!lista ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Select value={actual} onValueChange={elegir} disabled={guardando}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {lista.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nombre}
                {c.principal ? " (principal)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </BarPopover>
  );
}

