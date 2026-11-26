"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { openNewClient } from "@/components/clients/newClient";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { useClients } from "@/hooks/useClients";
import { useIntegraciones } from "@/hooks/useIntegraciones";
import { agregarTipo, useTipos } from "@/hooks/useTipos";
import { periodoDelTitulo, type TareaCompleta } from "@/lib/plani/basecamp";
import { MESES } from "@/lib/plani/config";
import { planiErrorMessage, planiRepo } from "@/lib/plani/repo";
import { COLORES_TIPO, HERRAMIENTAS, ICONOS, iconoDe, idDeNombre, normalizarPalabras, tipoDeTitulo, tiposRepo, type Herramienta } from "@/lib/plani/tipos";
import type { PlaniTipo } from "@/lib/plani/types";
import { fold } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { BasecampMark, TareaPicker } from "./BasecampTarea";

/** El mes que viene: las planis se arman el mes anterior. */
function mesQueViene() {
  const d = new Date();
  return d.getMonth() === 11 ? { anio: d.getFullYear() + 1, mes: 1 } : { anio: d.getFullYear(), mes: d.getMonth() + 2 };
}

export type NuevaPlaniInicial = { brandId?: string | null; anio?: number; mes?: number; tarea?: TareaCompleta | null; tipo?: PlaniTipo | null };

/**
 * Nueva presentación: tipo, cliente y mes. Si Basecamp está conectado, se puede colgar de la tarea
 * del brief (y si se arranca desde una tarea, ya viene todo elegido, el tipo incluido). Si el tipo
 * no existe todavía (ej: Programática), se crea acá mismo y queda para las próximas.
 */
export function NuevaPlaniDialog({
  open,
  onOpenChange,
  inicial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  inicial?: NuevaPlaniInicial;
}) {
  const router = useRouter();
  const { clients } = useClients();
  const { hayBasecamp } = useIntegraciones();
  const { tipos, tipoDe } = useTipos();
  const base = mesQueViene();
  const [brandId, setBrandId] = useState<string | null>(null);
  const [anio, setAnio] = useState(base.anio);
  const [mes, setMes] = useState(base.mes);
  const [tipo, setTipo] = useState<PlaniTipo>("planificacion");
  const [nuevoTipo, setNuevoTipo] = useState(false);
  const [tarea, setTarea] = useState<TareaCompleta | null>(null);
  const [eligiendoTarea, setEligiendoTarea] = useState(false);
  const [q, setQ] = useState("");
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBrandId(inicial?.brandId ?? null);
    // El mes: el de la tarea (por su título) manda; si no, el pedido o el que viene.
    const desdeTarea = inicial?.tarea ? periodoDelTitulo(inicial.tarea.titulo) : null;
    setAnio(desdeTarea?.anio ?? inicial?.anio ?? base.anio);
    setMes(desdeTarea?.mes ?? inicial?.mes ?? base.mes);
    // El tipo: el pedido, el de la tarea (por su título) o Planificación.
    const delTitulo = inicial?.tarea ? tipoDeTitulo(inicial.tarea.titulo, tipos) : null;
    setTipo(inicial?.tipo ?? delTitulo?.id ?? "planificacion");
    setNuevoTipo(false);
    setTarea(inicial?.tarea ?? null);
    setEligiendoTarea(false);
    setQ("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const f = fold(q.trim());
    return f ? clients.filter((c) => fold(c.name).includes(f)) : clients;
  }, [clients, q]);

  const brand = clients.find((c) => c.id === brandId) ?? null;
  const moverMes = (d: number) => {
    let m = mes + d;
    let a = anio;
    if (m < 1) {
      m = 12;
      a--;
    }
    if (m > 12) {
      m = 1;
      a++;
    }
    setMes(m);
    setAnio(a);
  };

  const crear = async () => {
    if (!brandId) return;
    setCreando(true);
    const { data, error } = await planiRepo.create({
      brand_id: brandId,
      anio,
      mes,
      tipo,
      titulo: `${tipoDe(tipo).nombre} ${MESES[mes - 1]} ${anio}`,
      bc_tarea_id: tarea?.id ?? null,
    });
    setCreando(false);
    if (error || !data) return toast(planiErrorMessage(error ?? { message: "No se pudo crear" }), "error");
    onOpenChange(false);
    router.push(`/presentaciones/${data.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva presentación</DialogTitle>
          <DialogDescription>Qué es, de qué cliente y de qué mes. Las piezas se agregan adentro.</DialogDescription>
        </DialogHeader>

        <div className="-mx-1 min-h-0 space-y-5 overflow-y-auto px-1">
          <section>
            <span className="eyebrow mb-2 block">Tipo</span>
            {nuevoTipo ? (
              <NuevoTipo
                onCreado={(id) => {
                  setTipo(id);
                  setNuevoTipo(false);
                }}
                onCancelar={() => setNuevoTipo(false)}
              />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tipos.map((t) => {
                  const Icono = iconoDe(t);
                  const activo = t.id === tipo;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTipo(t.id)}
                      aria-pressed={activo}
                      title={t.descripcion || undefined}
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                        activo ? "text-white" : "border-foreground/[0.08] bg-card hover:bg-secondary"
                      )}
                      style={activo ? { background: t.color, borderColor: t.color } : undefined}
                    >
                      <Icono className="h-4 w-4" style={activo ? undefined : { color: t.color }} /> {t.nombre}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setNuevoTipo(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-foreground/25 px-3 text-sm text-muted-foreground hover:border-foreground/45 hover:text-foreground"
                >
                  <Plus className="h-4 w-4" /> Otro tipo
                </button>
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="eyebrow">Cliente</span>
              <button
                type="button"
                onClick={() => openNewClient({ onCreated: (b) => setBrandId(b.id) })}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> Nuevo cliente
              </button>
            </div>
            <label className="relative mb-2 flex items-center">
              <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Buscar entre ${clients.length} clientes…`}
                className="h-9 w-full rounded-xl border border-foreground/[0.08] bg-background/60 pl-8 pr-3 text-sm outline-none focus:border-foreground/25"
              />
            </label>
            <ul className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3">
              {lista.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setBrandId(c.id);
                      if (tarea && brandId !== c.id) setTarea(null);
                    }}
                    aria-pressed={c.id === brandId}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl border p-1.5 pr-2.5 text-left text-sm transition-colors",
                      c.id === brandId ? "border-foreground bg-foreground text-background" : "border-foreground/[0.06] bg-card hover:bg-secondary"
                    )}
                  >
                    <ClientMark brand={c} className="h-8 w-8 rounded-lg text-[10px]" pad="p-[14%]" />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    {c.id === brandId && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-wrap items-end gap-4">
            <div>
              <span className="eyebrow mb-2 block">Mes</span>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Mes anterior" onClick={() => moverMes(-1)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[9.5rem] text-center font-display text-3xl leading-none">
                  {MESES[mes - 1]} <span className="text-muted-foreground">{anio}</span>
                </span>
                <button type="button" aria-label="Mes siguiente" onClick={() => moverMes(1)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>

          {hayBasecamp && brandId && (
            <section>
              <span className="eyebrow mb-2 block">Tarea de Basecamp</span>
              {tarea && !eligiendoTarea ? (
                <div className="flex items-center gap-2 rounded-xl border border-foreground/[0.06] bg-card px-3 py-2 text-sm">
                  <BasecampMark />
                  <span className="min-w-0 flex-1 truncate font-medium">{tarea.titulo}</span>
                  <button type="button" onClick={() => setEligiendoTarea(true)} className="text-xs text-muted-foreground hover:text-foreground">
                    Cambiar
                  </button>
                  <button type="button" onClick={() => setTarea(null)} className="text-xs text-muted-foreground hover:text-foreground">
                    Sacar
                  </button>
                </div>
              ) : eligiendoTarea ? (
                <TareaPicker
                  brandId={brandId}
                  mes={mes}
                  onPick={(t) => {
                    setTarea(t);
                    setEligiendoTarea(false);
                    // La tarea dice de qué mes es: se sigue eso.
                    const periodo = periodoDelTitulo(t.titulo);
                    if (periodo) {
                      setAnio(periodo.anio);
                      setMes(periodo.mes);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEligiendoTarea(true)}
                  className="flex w-full items-center gap-2 rounded-xl border border-dashed border-foreground/20 px-3 py-2.5 text-left text-sm text-muted-foreground hover:border-foreground/35 hover:text-foreground"
                >
                  <BasecampMark /> Vincular la tarea del brief (opcional)
                </button>
              )}
            </section>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] pt-4">
          {brand && (
            <span className="mr-auto truncate text-sm text-muted-foreground">
              {tipoDe(tipo).nombre} de <b className="font-semibold text-foreground">{brand.name}</b> · {MESES[mes - 1]} {anio}
            </span>
          )}
          <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-full px-4 text-sm font-medium hover:bg-secondary">
            Cancelar
          </button>
          <button
            type="button"
            onClick={crear}
            disabled={!brandId || creando}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 disabled:opacity-45"
          >
            {creando && <Loader2 className="h-4 w-4 animate-spin" />} Crear
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Un tipo nuevo (ej: "Programática" o "Influencers"): nombre, color, ícono y las palabras con las
 * que se lo reconoce en el título de una tarea de Basecamp. Queda para todo el estudio.
 */
function NuevoTipo({ onCreado, onCancelar }: { onCreado: (id: string) => void; onCancelar: () => void }) {
  const { porId } = useTipos();
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState(COLORES_TIPO[4]);
  const [icono, setIcono] = useState("presentacion");
  const [palabras, setPalabras] = useState("");
  const [herramientas, setHerramientas] = useState<Herramienta[]>([]);
  const [carpeta, setCarpeta] = useState("");
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    const limpio = nombre.trim();
    if (!limpio) return;
    // Un id que no choque con uno que ya existe ("leads" → "leads_2").
    const base = idDeNombre(limpio);
    let id = base;
    for (let n = 2; porId.has(id); n++) id = `${base.slice(0, 36)}_${n}`;
    setGuardando(true);
    const { data, error } = await tiposRepo.create({
      id,
      nombre: limpio,
      color,
      icono,
      // Si no se ponen palabras, se lo reconoce por su nombre.
      palabras: normalizarPalabras(palabras.trim() ? palabras : limpio),
      herramientas,
      carpeta: carpeta.trim() || null,
    });
    setGuardando(false);
    if (error || !data) return toast(planiErrorMessage(error ?? { message: "No se pudo crear el tipo" }), "error");
    agregarTipo(data);
    toast(`Listo: ${data.nombre} ya es un tipo de presentación`);
    onCreado(data.id);
  };

  return (
    <div className="space-y-3 rounded-2xl border border-foreground/[0.08] bg-card p-3">
      <input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value.slice(0, 60))}
        onKeyDown={(e) => e.key === "Enter" && crear()}
        placeholder="Nombre del tipo (ej: Programática, Influencers)"
        className="h-9 w-full rounded-xl border border-foreground/[0.08] bg-background/60 px-3 text-sm outline-none focus:border-foreground/25"
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="radiogroup" aria-label="Color">
          {COLORES_TIPO.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              aria-label={c}
              onClick={() => setColor(c)}
              className={cn("h-6 w-6 rounded-full ring-offset-2 ring-offset-card transition", c === color && "ring-2 ring-foreground")}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Ícono">
          {Object.entries(ICONOS).map(([key, { icon: Icono, label }]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={key === icono}
              aria-label={label}
              title={label}
              onClick={() => setIcono(key)}
              className={cn("grid h-7 w-7 place-items-center rounded-full transition-colors", key === icono ? "text-white" : "text-muted-foreground hover:bg-secondary")}
              style={key === icono ? { background: color } : undefined}
            >
              <Icono className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">
          Cómo reconocerlo en Basecamp: palabras del título de la tarea, separadas por coma (si no ponés nada, se usa el nombre)
        </span>
        <input
          value={palabras}
          onChange={(e) => setPalabras(e.target.value)}
          placeholder="programática, youtube, display"
          className="h-9 w-full rounded-xl border border-foreground/[0.08] bg-background/60 px-3 text-sm outline-none focus:border-foreground/25"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Su carpeta en Drive, adentro del mes (si no ponés nada, el nombre)</span>
        <input
          value={carpeta}
          onChange={(e) => setCarpeta(e.target.value)}
          placeholder="Anuncios"
          className="h-9 w-full rounded-xl border border-foreground/[0.08] bg-background/60 px-3 text-sm outline-none focus:border-foreground/25"
        />
      </label>
      <div>
        <span className="mb-1 block text-xs text-muted-foreground">Herramientas de la app que usa</span>
        <div className="flex flex-wrap gap-1.5">
          {HERRAMIENTAS.map((h) => {
            const on = herramientas.includes(h.value);
            return (
              <button
                key={h.value}
                type="button"
                aria-pressed={on}
                title={h.hint}
                onClick={() => setHerramientas((x) => (on ? x.filter((v) => v !== h.value) : [...x, h.value]))}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  on ? "border-foreground bg-foreground text-background" : "border-foreground/[0.08] bg-background/60 hover:bg-secondary"
                )}
              >
                {on && <Check className="h-3.5 w-3.5" />} {h.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="h-8 rounded-full px-3 text-sm font-medium hover:bg-secondary">
          Cancelar
        </button>
        <button
          type="button"
          onClick={crear}
          disabled={!nombre.trim() || guardando}
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white disabled:opacity-45"
          style={{ background: color }}
        >
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Crear tipo
        </button>
      </div>
    </div>
  );
}
