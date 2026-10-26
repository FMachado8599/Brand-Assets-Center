"use client";

import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { ArrowUpRight, Check, CheckCheck, Loader2, Pause, Play, Sparkles, Undo2, UserCheck } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { cambiarTarea } from "@/hooks/useFlujo";
import {
  designadoDe,
  ejecutaSector,
  ETAPA_LABEL,
  etapaDe,
  etapasDe,
  flujoErrorMessage,
  flujoRepo,
  responsableDe,
  sectorDeEtapa,
  validadoresDe,
  type Contexto,
  type Etapa,
  type Movimiento,
  type TareaFlujo,
} from "@/lib/board/flujo";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar } from "./comun";
import { SelectSimple } from "./equipo/piezas";
import { fechaCorta } from "./TareaCard";

// El brief viene de Basecamp: se muestra con el formato básico y sin nada que pueda ejecutarse.
const LIMPIEZA = {
  ALLOWED_TAGS: ["div", "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "h1", "h2", "h3", "blockquote", "pre", "code"],
  ALLOWED_ATTR: ["href"],
};

const ORIGEN: Record<string, string> = {
  tomada: "La tomó (o se la pasaron)",
  designado: "Designado de la marca",
  basecamp: "Asignado en Basecamp",
};

function cuando(iso: string) {
  return new Date(iso).toLocaleString("es-UY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Todo de una tarea: en qué etapa está, quién la tiene (tomarla, pasarla, devolverla), la
 * validación, las fechas (con la IA para la vigencia), el brief y lo que le fue pasando.
 */
export function TareaDetalle({
  tarea,
  ctx,
  marca,
  validaron,
  onClose,
  onValidado,
}: {
  tarea: TareaFlujo | null;
  ctx: Contexto | null;
  marca?: Brand;
  validaron: Set<string>;
  onClose: () => void;
  onValidado: () => void;
}) {
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ia, setIa] = useState(false);
  const [nota, setNota] = useState("");
  const id = tarea?.id ?? null;

  const cargarHistorial = (tareaId: number) => flujoRepo.movimientos(tareaId).then(setMovimientos, () => setMovimientos([]));

  useEffect(() => {
    setMovimientos(null);
    setBrief(null);
    setMotivo("");
    setNota("");
    if (id == null) return;
    cargarHistorial(id);
    flujoRepo.brief(id).then(setBrief, () => setBrief(""));
  }, [id]);

  const html = useMemo(() => (brief && typeof window !== "undefined" ? DOMPurify.sanitize(brief, LIMPIEZA) : ""), [brief]);

  if (!tarea || !ctx) return <Dialog open={false} />;

  const t = tarea;
  const etapa = etapaDe(t);
  const resp = responsableDe(t, ctx);
  const sector = sectorDeEtapa(etapa, t.tablero, ctx.data);
  const yo = ctx.data.yo?.equipo_id ?? null;
  const designado = sector ? designadoDe(ctx, t.brand_id, sector) : null;
  const gente = sector ? ctx.data.personas.filter((p) => p.activo && ejecutaSector(ctx, p.id, sector)) : [];
  const validadores = etapa === "validacion" ? validadoresDe(t, ctx) : [];
  const puedoValidar = Boolean(yo && (validadores.some((p) => p.id === yo) || ctx.data.yo?.admin));
  const nombre = (personaId: string | null) => (personaId ? (ctx.porId.get(personaId)?.nombre ?? "Alguien") : "Basecamp");

  const hecho = () => cargarHistorial(t.id);

  async function mover(nueva: Etapa) {
    if (nueva === etapa) return;
    if (await cambiarTarea(t.id, { etapa: nueva, responsable_id: null }, () => flujoRepo.mover(t.id, nueva, null, nota), `Pasó a ${ETAPA_LABEL[nueva]}`)) {
      setNota("");
      hecho();
    }
  }

  async function asignar(persona: string | null) {
    // Pasársela al designado es devolvérsela (queda "del designado", no "tomada").
    const valor = persona && persona === designado?.id ? null : persona;
    const quien = valor ? ctx!.porId.get(valor)?.nombre : designado?.nombre;
    if (await cambiarTarea(t.id, { responsable_id: valor }, () => flujoRepo.asignar(t.id, valor), quien ? `Ahora la tiene ${quien}` : "Volvió al designado")) hecho();
  }

  async function pausar() {
    const pausada = !t.pausada;
    if (await cambiarTarea(t.id, { pausada, pausa_motivo: pausada ? motivo || null : null }, () => flujoRepo.pausar(t.id, pausada, motivo), pausada ? "En pausa" : "Reanudada")) {
      setMotivo("");
      hecho();
    }
  }

  async function vigencia(fecha: string | null) {
    if (await cambiarTarea(t.id, { vigente_hasta: fecha, vigente_origen: fecha ? "manual" : null, vigencia: fecha ?? t.vence }, () => flujoRepo.vigencia(t.id, fecha))) hecho();
  }

  async function vigenciaIA() {
    setIa(true);
    try {
      const r = await flujoRepo.vigenciaIA(t.id);
      await cambiarTarea(t.id, { vigente_hasta: r.fecha, vigente_origen: "ia", vigencia: r.fecha }, async () => undefined);
      toast(`Vigente hasta el ${fechaCorta(r.fecha)}${r.motivo ? `: ${r.motivo}` : ""}`);
      hecho();
    } catch (e) {
      toast(flujoErrorMessage((e as Error).message), "error");
    } finally {
      setIa(false);
    }
  }

  async function validar() {
    try {
      await flujoRepo.validar(t.id, nota);
      toast("Validada por vos");
      setNota("");
      hecho();
      onValidado();
    } catch (e) {
      toast(flujoErrorMessage((e as Error).message), "error");
    }
  }

  const asignadosBc = t.asignados.map((bc) => ctx.porBc.get(bc)).filter(Boolean);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="left-auto right-0 top-0 h-[100dvh] max-h-none w-full max-w-xl translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none p-0 sm:rounded-l-3xl">
        <div className="space-y-5 p-5 sm:p-6">
          <header className="space-y-2 pr-8">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ClientMark brand={marca ?? { name: t.proyecto, color: "#52525B", logo_url: null, logo_bg: "light" }} className="h-6 w-6 rounded-md text-[9px]" />
              {marca?.name ?? t.proyecto}
              {t.tablero ? ` · ${t.tablero}` : ""}
            </p>
            <DialogTitle className="text-2xl leading-tight">{t.titulo || "Sin título"}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>En Basecamp: {t.columna ?? "—"}</span>
              {t.app_url && (
                <a href={t.app_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:underline">
                  Abrir en Basecamp <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}
            </DialogDescription>
          </header>

          {/* Etapa */}
          <section className="space-y-2">
            <h3 className="eyebrow text-muted-foreground">Etapa</h3>
            <div className="flex flex-wrap gap-1.5">
              {etapasDe(t.tablero).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => mover(e)}
                  aria-pressed={e === etapa}
                  className={cn(
                    "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
                    e === etapa ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/30"
                  )}
                >
                  {ETAPA_LABEL[e]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Nota para el historial (ej: cambios del cliente)"
                className="h-9 min-w-0 flex-1 rounded-full border bg-card px-3 text-sm outline-none focus:border-foreground/40"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-secondary/55 p-2">
              {!t.pausada && (
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo de la pausa (opcional)"
                  className="h-8 min-w-0 flex-1 rounded-full bg-card px-3 text-[13px] outline-none"
                />
              )}
              {t.pausada && <span className="flex-1 px-2 text-[13px]">En pausa{t.pausa_motivo ? `: ${t.pausa_motivo}` : ""}</span>}
              <button type="button" onClick={pausar} className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] font-medium hover:border-foreground/30">
                {t.pausada ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {t.pausada ? "Reanudar" : "Pausar"}
              </button>
            </div>
          </section>

          {/* Quién la tiene / Validación */}
          {etapa === "validacion" ? (
            <section className="space-y-2">
              <h3 className="eyebrow text-muted-foreground">La validan</h3>
              <ul className="space-y-1.5">
                {validadores.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm">
                    <Avatar nombre={p.nombre} url={p.avatar_url} className="h-7 w-7" />
                    <span className="flex-1">{p.nombre}</span>
                    {validaron.has(p.id) ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCheck className="h-3.5 w-3.5" /> Validó
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Falta</span>
                    )}
                  </li>
                ))}
                {!validadores.length && <li className="text-sm text-muted-foreground">Nadie relacionado todavía: cargá los designados de la marca en Equipo.</li>}
              </ul>
              {(() => {
                const otros = [...validaron].filter((id) => !validadores.some((p) => p.id === id)).map((id) => ctx.porId.get(id)?.nombre ?? "Alguien");
                return otros.length ? <p className="text-xs text-muted-foreground">También validó: {otros.join(", ")}</p> : null;
              })()}
              <div className="flex flex-wrap gap-2 pt-1">
                {yo && puedoValidar && !validaron.has(yo) && (
                  <button type="button" onClick={validar} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90">
                    <Check className="h-4 w-4" /> Validar
                  </button>
                )}
                <button type="button" onClick={() => mover("cliente")} className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-medium hover:border-foreground/30">
                  Aprobada → Cliente
                </button>
                <button
                  type="button"
                  onClick={() => mover(t.tablero === "Digital" ? "diseno" : "en_proceso")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-medium hover:border-foreground/30"
                >
                  <Undo2 className="h-4 w-4" /> Pedir cambios
                </button>
              </div>
            </section>
          ) : sector ? (
            <section className="space-y-2">
              <h3 className="eyebrow text-muted-foreground">La tiene</h3>
              <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                {resp.persona ? (
                  <>
                    <Avatar nombre={resp.persona.nombre} url={resp.persona.avatar_url} className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{resp.persona.nombre}</p>
                      <p className="text-xs text-muted-foreground">{resp.origen ? ORIGEN[resp.origen] : ""}</p>
                    </div>
                  </>
                ) : (
                  <p className="flex-1 text-sm text-muted-foreground">Sin asignar: la marca no tiene designado para esta etapa.</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {yo && ejecutaSector(ctx, yo, sector) && resp.persona?.id !== yo && (
                  <button type="button" onClick={() => asignar(yo)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90">
                    <UserCheck className="h-4 w-4" /> Tomarla
                  </button>
                )}
                {resp.origen === "tomada" && designado && (
                  <button type="button" onClick={() => asignar(null)} className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-medium hover:border-foreground/30">
                    <Undo2 className="h-4 w-4" /> Devolver a {designado.nombre}
                  </button>
                )}
                <div className="min-w-[12rem] flex-1">
                  <SelectSimple
                    value={null}
                    onChange={(v) => v && asignar(v)}
                    opciones={gente.filter((p) => p.id !== resp.persona?.id).map((p) => ({ value: p.id, label: p.nombre }))}
                    placeholder="Pasársela a…"
                  />
                </div>
              </div>
            </section>
          ) : null}

          {/* Fechas */}
          <section className="space-y-2">
            <h3 className="eyebrow text-muted-foreground">Fechas</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border bg-card p-3">
                <p className="text-xs text-muted-foreground">Entrega (Basecamp)</p>
                <p className="mt-0.5 text-sm font-medium">{t.vence ? fechaCorta(t.vence) : "Sin fecha"}</p>
              </div>
              <div className="rounded-2xl border bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  Vigente hasta {t.vigente_origen === "ia" ? "· la puso la IA" : t.vigente_origen === "manual" ? "· a mano" : "· la de Basecamp"}
                </p>
                <input
                  type="date"
                  value={t.vigente_hasta ?? t.vence ?? ""}
                  onChange={(e) => vigencia(e.target.value || null)}
                  className="mt-0.5 w-full bg-transparent text-sm font-medium outline-none"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={vigenciaIA} disabled={ia} className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] font-medium hover:border-foreground/30 disabled:opacity-60">
                {ia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Calcular con IA
              </button>
              {t.vigente_hasta && (
                <button type="button" onClick={() => vigencia(null)} className="h-8 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground">
                  Usar la de Basecamp
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Terminada y pasada esta fecha, la tarea se archiva. La IA lee el título y el brief y solo cambia esta fecha.</p>
          </section>

          {asignadosBc.length > 0 && (
            <section className="space-y-2">
              <h3 className="eyebrow text-muted-foreground">Asignados en Basecamp</h3>
              <div className="flex flex-wrap gap-1.5">
                {asignadosBc.map((p) => (
                  <span key={p!.id} className="inline-flex items-center gap-1.5 rounded-full bg-secondary py-0.5 pl-0.5 pr-2 text-xs font-medium">
                    <Avatar nombre={p!.nombre} url={p!.avatar_url} className="h-5 w-5 text-[8px]" />
                    {p!.nombre}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Brief */}
          <section className="space-y-2">
            <h3 className="eyebrow text-muted-foreground">Brief</h3>
            {brief === null ? (
              <div className="skeleton h-20 rounded-2xl" />
            ) : html ? (
              <div className="prose-sm max-w-none rounded-2xl border bg-card p-4 text-sm leading-relaxed [&_a]:underline [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc" dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <p className="text-sm text-muted-foreground">Sin brief en Basecamp.</p>
            )}
          </section>

          {/* Historial */}
          <section className="space-y-2">
            <h3 className="eyebrow text-muted-foreground">Historial</h3>
            {movimientos === null ? (
              <div className="skeleton h-16 rounded-2xl" />
            ) : !movimientos.length ? (
              <p className="text-sm text-muted-foreground">Todavía no se movió desde que está en el Board.</p>
            ) : (
              <ol className="space-y-2 border-l pl-4">
                {movimientos.map((m) => (
                  <li key={m.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-foreground/40" />
                    <p>
                      <span className="font-medium">{m.origen === "basecamp" ? "Basecamp" : m.origen === "ia" ? "IA" : nombre(m.autor_id)}</span>{" "}
                      {describir(m)}
                    </p>
                    {m.nota && <p className="text-xs text-muted-foreground">“{m.nota}”</p>}
                    <p className="text-[11px] text-muted-foreground">{cuando(m.creado)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function describir(m: Movimiento) {
  const etapa = (e: string | null) => (e ? (ETAPA_LABEL[e as Etapa] ?? e) : "—");
  switch (m.tipo) {
    case "etapa":
      return `la pasó de ${etapa(m.de)} a ${etapa(m.a)}`;
    case "responsable":
      return m.a === "designado" ? `se la devolvió al designado (la tenía ${m.de})` : `se la pasó a ${m.a}${m.de && m.de !== "designado" ? ` (la tenía ${m.de})` : ""}`;
    case "pausa":
      return m.a === "pausada" ? "la pausó" : "la reanudó";
    case "fecha":
      return m.a ? `puso vigente hasta el ${fechaCorta(m.a)}` : "volvió a la fecha de Basecamp";
    case "validacion":
      return "la validó";
  }
}
