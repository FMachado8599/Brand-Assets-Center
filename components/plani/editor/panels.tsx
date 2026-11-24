"use client";

import { useState } from "react";
import { Check, CheckCircle2, Copy, Download, Loader2, Minus, PenLine, Plus, Smartphone, Sparkles } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { copyPlain } from "@/lib/cards/clipboard";
import { BANNERS, FORMATOS, formatosDe, MEDIDAS, medidaDe, PLATAFORMAS, plataformaInfo } from "@/lib/plani/config";
import { CTAS } from "@/lib/ads/text";
import { PLACEMENTS, type Placement } from "@/lib/ads/placements";
import { CTA_POR_DEFECTO, lugaresDe } from "../AnuncioMockup";
import { useHerramientas } from "../herramientas";
import type { Formato, Medio, Pieza, PiezaPatch, Plataforma, Proporcion, Sticker } from "@/lib/plani/types";
import { cn } from "@/lib/utils";
import { copyTexto, largoCopy, limiteCopy } from "@/lib/plani/copy";
import { descargar, nombreArchivo } from "@/lib/plani/descargas";
import type { Brand } from "@/lib/types";
import { FormatIcon, medioUrl, pesoLegible } from "../bits";
import { PlatformIcon } from "../PlatformIcon";
import { AutoText, Field, LinkList, Segmented, TextInput } from "./fields";
import { ArmarGif } from "./ArmarGif";
import { Inspiracion } from "./Inspiracion";
import { MediaManager } from "./MediaManager";
import { StickerEditor } from "./StickerEditor";

type PanelProps = {
  pieza: Pieza;
  update: (patch: PiezaPatch, ahora?: boolean) => void;
};

/* ───────────── Redacción ───────────── */

/**
 * Redacción: qué es la pieza, en qué redes sale, el copy (uno solo para todas) y lo que diseño
 * tiene que hacer (en un carrusel, slide por slide), con referencias y assets.
 */
export function PanelRedaccion({
  pieza,
  update,
  onAdaptar,
  onRedactar,
}: PanelProps & { onAdaptar?: () => void; onRedactar?: () => void }) {
  const info = FORMATOS[pieza.formato];
  const herramientas = useHerramientas();

  const cambiarFormato = (formato: Formato) => {
    const nuevo = FORMATOS[formato];
    const patch: PiezaPatch = { formato };
    if (!nuevo.proporciones.includes(pieza.proporcion)) patch.proporcion = nuevo.proporciones[0];
    if (formato === "banner" && !pieza.ancho) Object.assign(patch, { ancho: 300, alto: 250 });
    if (formato === "carrusel" && pieza.slides.length < 2) patch.slides = [{ instruccion: pieza.instrucciones }, { instruccion: "" }, { instruccion: "" }];
    update(patch, true);
  };

  const togglePlataforma = (p: Plataforma) => {
    const on = pieza.plataformas.includes(p);
    if (on && pieza.plataformas.length === 1) return;
    update({ plataformas: on ? pieza.plataformas.filter((x) => x !== p) : [...pieza.plataformas, p] }, true);
  };

  const setSlide = (i: number, instruccion: string) =>
    update({ slides: pieza.slides.map((s, j) => (j === i ? { instruccion } : s)) });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Formato">
          <Segmented
            value={pieza.formato}
            onChange={cambiarFormato}
            options={formatosDe(herramientas.gif).map((f) => ({ value: f, label: <><FormatIcon formato={f} className="h-3 w-3" /> {FORMATOS[f].label}</> }))}
          />
        </Field>
        {pieza.formato === "banner" && <MedidaBanner pieza={pieza} update={update} />}
        {info.proporciones.length > 1 && (
          <Field label="Proporción">
            <Segmented
              value={pieza.proporcion}
              onChange={(proporcion: Proporcion) => update({ proporcion }, true)}
              options={info.proporciones.map((p) => ({ value: p, label: p, title: `${MEDIDAS[p].w}×${MEDIDAS[p].h}` }))}
            />
          </Field>
        )}
      </div>

      {pieza.formato !== "banner" && (
      <Field label="Redes">
        <div className="flex flex-wrap gap-1.5">
          {PLATAFORMAS.map((p) => {
            const on = pieza.plataformas.includes(p.value);
            return (
              <button
                key={p.value}
                type="button"
                aria-pressed={on}
                onClick={() => togglePlataforma(p.value)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  on ? "border-foreground bg-foreground text-background" : "border-foreground/[0.08] bg-card hover:bg-secondary"
                )}
              >
                <PlatformIcon platform={p.value} className="h-3.5 w-3.5" /> {p.label}
              </button>
            );
          })}
        </div>
      </Field>
      )}

      <CopyCampo pieza={pieza} onRedactar={onRedactar} />

      {herramientas.ads && pieza.formato !== "banner" && <CamposAnuncio pieza={pieza} update={update} />}

      {pieza.formato === "carrusel" ? (
        <Field
          label={`Indicaciones · ${pieza.slides.length} slides`}
          action={
            <span className="flex items-center gap-1">
              <SmallRound label="Sacar la última slide" onClick={() => pieza.slides.length > 2 && update({ slides: pieza.slides.slice(0, -1) }, true)} icon={Minus} />
              <SmallRound label="Agregar una slide" onClick={() => pieza.slides.length < 20 && update({ slides: [...pieza.slides, { instruccion: "" }] }, true)} icon={Plus} />
            </span>
          }
        >
          <div className="space-y-2">
            <AutoText value={pieza.instrucciones} onChange={(e) => update({ instrucciones: e.target.value })} placeholder="Idea general del carrusel (opcional)…" />
            <ol className="space-y-2">
              {pieza.slides.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-bold">{i + 1}</span>
                  <AutoText value={s.instruccion} onChange={(e) => setSlide(i, e.target.value)} placeholder={`Slide ${i + 1}: texto e imagen…`} />
                </li>
              ))}
            </ol>
          </div>
        </Field>
      ) : (
        <Field label="Indicaciones para diseño">
          <AutoText
            value={pieza.instrucciones}
            onChange={(e) => update({ instrucciones: e.target.value })}
            placeholder={pieza.formato === "reel" ? "Guion, tomas, textos en pantalla, música…" : "Qué va en la pieza: texto, imagen, tono…"}
            className="min-h-[5.5rem]"
          />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Referencias">
          <LinkList items={pieza.referencias} onChange={(referencias) => update({ referencias }, true)} placeholder="Pinterest, Behance, un post…" />
        </Field>
        <Field label="Assets">
          <LinkList items={pieza.assets} onChange={(assets) => update({ assets }, true)} placeholder="Carpeta de fotos, logo, video…" />
        </Field>
      </div>

      <Field label="Inspiración">
        <Inspiracion pieza={pieza} onChange={(medios) => update({ medios }, true)} />
      </Field>

      {onAdaptar && pieza.formato !== "historia" && (
        <button
          type="button"
          onClick={onAdaptar}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/[0.08] bg-card px-3 text-xs font-medium shadow-sm transition-colors hover:bg-secondary"
        >
          <Smartphone className="h-3.5 w-3.5" /> Adaptar a historia
        </button>
      )}
    </div>
  );
}

/**
 * El copy en el panel: se lee acá y se escribe en el popup (el editor de Redacción con los emojis
 * y hashtags del cliente). Un click en cualquier lado lo abre.
 */
function CopyCampo({ pieza, onRedactar }: { pieza: Pieza; onRedactar?: () => void }) {
  const texto = copyTexto(pieza);
  const largo = largoCopy(texto);
  const limite = limiteCopy(pieza.plataformas);
  return (
    <Field
      label="Copy"
      hint={pieza.plataformas.length > 1 ? `El mismo en todas las redes. Límite: ${limite.limite} (${limite.label}).` : undefined}
      action={
        <span className={cn("text-[11px] tabular-nums", largo > limite.limite ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {largo}/{limite.limite}
        </span>
      }
    >
      <button
        type="button"
        onClick={onRedactar}
        disabled={!onRedactar}
        className="group relative block min-h-[5.5rem] w-full rounded-xl border border-foreground/[0.08] bg-background/60 px-3 py-2.5 text-left text-sm leading-relaxed transition-colors hover:border-foreground/15 hover:bg-card"
      >
        {texto ? (
          <span className="line-clamp-6 whitespace-pre-line">{texto}</span>
        ) : (
          <span className="text-muted-foreground/80">Escribí el copy…</span>
        )}
        <span className="absolute bottom-2 right-2 inline-flex h-6 items-center gap-1 rounded-full bg-foreground px-2 text-[11px] font-medium text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <PenLine className="h-3 w-3" /> {texto ? "Editar" : "Escribir"}
        </span>
      </button>
    </Field>
  );
}

function SmallRound({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: typeof Plus }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded-full border border-foreground/[0.08] bg-card text-muted-foreground shadow-sm hover:text-foreground"
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}

/* ───────────── Diseño ───────────── */

/**
 * Diseño: lo que pidió redacción, para leer (sin poder pisarlo), y el material final para subir.
 * En una historia, además, los stickers.
 */
export function PanelDiseno({
  pieza,
  brand,
  update,
  stickerSel,
  onStickerSel,
  adaptaDe,
}: PanelProps & { brand: Brand; stickerSel: string | null; onStickerSel: (id: string | null) => void; adaptaDe?: Pieza | null }) {
  const medida = medidaDe(pieza);
  const [armandoGif, setArmandoGif] = useState(false);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-secondary/55 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="eyebrow">Lo que pidió redacción</span>
          <span className="text-[11px] font-medium text-muted-foreground">
            {medida.label} · {medida.w}×{medida.h} px
          </span>
        </div>
        {adaptaDe && (
          <p className="mt-2 text-xs text-muted-foreground">
            Adaptación a historia de <b className="font-semibold text-foreground">{adaptaDe.titulo || FORMATOS[adaptaDe.formato].label}</b>: misma idea, en vertical.
          </p>
        )}
        {pieza.formato === "carrusel" ? (
          <div className="mt-2 space-y-2">
            {pieza.instrucciones && <p className="whitespace-pre-line text-sm leading-relaxed">{pieza.instrucciones}</p>}
            <ol className="space-y-1.5">
              {pieza.slides.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-card text-[10px] font-bold">{i + 1}</span>
                  <span className={cn("whitespace-pre-line", !s.instruccion && "italic text-muted-foreground")}>{s.instruccion || "Sin indicaciones"}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className={cn("mt-2 whitespace-pre-line text-sm leading-relaxed", !pieza.instrucciones && "italic text-muted-foreground")}>
            {pieza.instrucciones || "Redacción todavía no dejó indicaciones."}
          </p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Referencias">
            <LinkList items={pieza.referencias} empty="Sin referencias" />
          </Field>
          <Field label="Assets">
            <LinkList items={pieza.assets} empty="Sin assets" />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Inspiración">
            <Inspiracion pieza={pieza} />
          </Field>
        </div>
      </div>

      {pieza.formato === "banner" && (
        <>
          <button
            type="button"
            onClick={() => setArmandoGif(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-foreground/[0.08] bg-card px-4 text-sm font-medium hover:bg-secondary"
          >
            <Sparkles className="h-4 w-4" /> Armar el GIF con los frames
          </button>
          <ArmarGif pieza={pieza} open={armandoGif} onOpenChange={setArmandoGif} onListo={(medios) => update({ medios }, true)} />
        </>
      )}

      <MediaManager pieza={pieza} onChange={(medios: Medio[]) => update({ medios }, true)} />

      {pieza.formato === "historia" && (
        <StickerEditor
          brand={brand}
          stickers={pieza.stickers}
          onChange={(stickers: Sticker[]) => update({ stickers })}
          selected={stickerSel}
          onSelect={onStickerSel}
        />
      )}
    </div>
  );
}

/* ───────────── CM ───────────── */

/**
 * CM: cuándo sale, los copys listos para copiar, el material para bajar (de a uno o todo junto) y
 * la marca de "programada" cuando ya está cargada en la red.
 */
export function PanelCM({ pieza, titulo, update }: PanelProps & { titulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  const copy = copyTexto(pieza);
  const [bajando, setBajando] = useState<{ id: string; progreso: number } | null>(null);
  const finales = pieza.medios.filter((m) => m.rol === "final");
  const portada = pieza.medios.find((m) => m.rol === "portada");
  const material = [...finales, ...(portada ? [portada] : [])];
  const nombre = (m: Medio) => nombreArchivo(pieza, m, titulo ?? pieza.titulo);

  const copiar = async () => {
    const ok = await copyPlain(copy);
    if (!ok) return toast("No se pudo copiar", "error");
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1600);
  };

  const bajar = async (id: string, lista: Medio[]) => {
    if (bajando) return;
    setBajando({ id, progreso: 0 });
    try {
      await descargar(
        lista.map((m) => ({ nombre: nombre(m), url: medioUrl(m), tamano: m.tamano })),
        nombre(lista[0]).replace(/\.[^.]+$/, "").replace(/ \d+$/, ""),
        (progreso) => setBajando({ id, progreso })
      );
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBajando(null);
    }
  };

  return (
    <div className="space-y-5">
      <button
        type="button"
        aria-pressed={pieza.programada}
        onClick={() => update({ programada: !pieza.programada }, true)}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
          pieza.programada ? "border-emerald-700/30 bg-emerald-600/12" : "border-dashed border-foreground/20 hover:bg-secondary/60"
        )}
      >
        <CheckCircle2 className={cn("h-6 w-6 shrink-0", pieza.programada ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")} />
        <span className="min-w-0">
          <span className="block font-display text-2xl leading-none">{pieza.programada ? "Programada" : "Sin programar"}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {pieza.programada ? "Ya está cargada en la red. Click para desmarcar." : "Marcala cuando la dejes programada."}
          </span>
        </span>
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha">
          <TextInput type="date" value={pieza.fecha} onChange={(e) => e.target.value && update({ fecha: e.target.value }, true)} />
        </Field>
        <Field label="Hora">
          <TextInput type="time" value={pieza.hora?.slice(0, 5) ?? ""} onChange={(e) => update({ hora: e.target.value || null }, true)} />
        </Field>
      </div>

      <Field
        label="Material"
        action={
          material.length > 1 ? (
            <button
              type="button"
              onClick={() => bajar("todo", material)}
              disabled={!!bajando}
              className="inline-flex h-7 items-center gap-1.5 rounded-full bg-foreground px-3 text-[11px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {bajando?.id === "todo" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              {bajando?.id === "todo" ? `${Math.round(bajando.progreso * 100)}%` : "Bajar todo (.zip)"}
            </button>
          ) : undefined
        }
      >
        {material.length ? (
          <ul className="space-y-1.5">
            {material.map((m) => {
              const este = bajando?.id === m.id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => bajar(m.id, [m])}
                    disabled={!!bajando}
                    className="relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-foreground/[0.06] bg-card px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-secondary disabled:cursor-wait"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={medioUrl(m, 120)}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-md bg-secondary object-cover"
                      onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{nombre(m)}</span>
                      <span className="block text-[11px] text-muted-foreground">{pesoLegible(m.tamano)}</span>
                    </span>
                    {este ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : <Download className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    {este && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-[width]" style={{ width: `${bajando!.progreso * 100}%` }} />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm italic text-muted-foreground">Diseño todavía no subió el material.</p>
        )}
      </Field>

      <Field
        label={`Copy · ${pieza.plataformas.map((p) => plataformaInfo(p).label).join(", ")}`}
        action={
          <button
            type="button"
            onClick={copiar}
            disabled={!copy}
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-foreground px-3 text-[11px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copiado ? "Copiado" : "Copiar copy"}
          </button>
        }
      >
        <p className={cn("whitespace-pre-line rounded-xl bg-secondary/55 px-3 py-2.5 text-sm leading-relaxed", !copy && "italic text-muted-foreground")}>
          {copy || "Sin copy"}
        </p>
      </Field>
    </div>
  );
}

/* ───────────── Banners y anuncios ───────────── */

/** La medida de un banner: las de siempre de display (IAB) o una a mano. */
function MedidaBanner({ pieza, update }: PanelProps) {
  const { w, h } = medidaDe(pieza);
  const elegida = BANNERS.find((b) => b.w === w && b.h === h);
  const num = (v: string) => Math.max(10, Math.min(4000, Math.round(Number(v) || 0)));
  return (
    <Field label="Medida">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={elegida ? `${w}x${h}` : "otra"}
          onChange={(e) => {
            const b = BANNERS.find((x) => `${x.w}x${x.h}` === e.target.value);
            if (b) update({ ancho: b.w, alto: b.h }, true);
          }}
          className="h-8 rounded-full border border-foreground/[0.08] bg-card px-3 text-xs font-medium outline-none"
          aria-label="Medida del banner"
        >
          {BANNERS.map((b) => (
            <option key={`${b.w}x${b.h}`} value={`${b.w}x${b.h}`}>
              {b.w}×{b.h} · {b.label}
            </option>
          ))}
          <option value="otra">Otra medida</option>
        </select>
        <input
          type="number"
          value={w}
          min={10}
          max={4000}
          onChange={(e) => update({ ancho: num(e.target.value) })}
          aria-label="Ancho en px"
          className="h-8 w-20 rounded-full border border-foreground/[0.08] bg-card px-3 text-xs tabular-nums outline-none"
        />
        <span className="text-xs text-muted-foreground">×</span>
        <input
          type="number"
          value={h}
          min={10}
          max={4000}
          onChange={(e) => update({ alto: num(e.target.value) })}
          aria-label="Alto en px"
          className="h-8 w-20 rounded-full border border-foreground/[0.08] bg-card px-3 text-xs tabular-nums outline-none"
        />
        <span className="text-xs text-muted-foreground">px</span>
      </div>
    </Field>
  );
}

/** Lo del anuncio que escribe Redacción: el título, el botón y dónde sale. */
function CamposAnuncio({ pieza, update }: PanelProps) {
  const anuncio = pieza.anuncio ?? {};
  const lugares = lugaresDe(pieza, null);
  const set = (patch: Partial<typeof anuncio>, ahora = false) => update({ anuncio: { ...anuncio, ...patch } }, ahora);
  const toggle = (l: Placement) => {
    const on = lugares.includes(l);
    if (on && lugares.length === 1) return;
    set({ lugares: on ? lugares.filter((x) => x !== l) : [...lugares, l] }, true);
  };
  return (
    <div className="space-y-4 rounded-2xl bg-secondary/55 p-4">
      <span className="eyebrow">El anuncio</span>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Título (la tarjeta de Reels)">
          <TextInput value={anuncio.titulo ?? ""} onChange={(e) => set({ titulo: e.target.value })} placeholder={pieza.titulo || "Un título corto"} />
        </Field>
        <Field label="Botón">
          <select
            value={anuncio.cta || CTA_POR_DEFECTO}
            onChange={(e) => set({ cta: e.target.value }, true)}
            className="h-9 rounded-xl border border-foreground/[0.08] bg-card px-3 text-sm outline-none"
          >
            {CTAS.map((c) => (
              <option key={c.es} value={c.es}>
                {c.es}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Dónde sale">
        <div className="flex flex-wrap gap-1.5">
          {PLACEMENTS.map((p) => {
            const on = lugares.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                title={p.hint}
                onClick={() => toggle(p.id)}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                  on ? "border-foreground bg-foreground text-background" : "border-foreground/[0.08] bg-card hover:bg-secondary"
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </Field>
    </div>
  );
}
