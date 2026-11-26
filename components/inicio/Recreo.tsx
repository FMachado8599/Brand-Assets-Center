"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Coffee, Lightbulb, Loader2, Palmtree, Search, Sparkles, Target } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { toast } from "@/components/ui/toaster";
import { useMiPerfil, guardarMiPerfil } from "@/hooks/useMiPerfil";
import { copyEmojiText } from "@/lib/emojis/clipboard";
import { charFor, imageUrl, type EmojiEntry } from "@/lib/emojis/types";
import { efemerideDe, encabezadoEfemeride } from "@/lib/inicio/efemerides";
import { diasHasta, hoyISO } from "@/lib/inicio/fechas";
import { empezarFoco, useFoco, reloj } from "@/lib/inicio/foco";
import { emojiDelEstudio, misNumeros, type EmojiEstudio, type Numeros } from "@/lib/inicio/repo";
import { tipDelDia } from "@/lib/inicio/tips";
import { registrarUso } from "@/lib/inicio/uso";
import { marcasJugables, nuevaPregunta, type Pregunta } from "@/lib/rest/paleta";
import { cn } from "@/lib/utils";
import { abrirBuscador } from "./Buscador";
import { CAJA, Seccion, pesoLegible, useAjustesInicio } from "./piezas";
import type { DatosInicio } from "./useInicio";

export function Recreo({ d }: { d: DatosInicio }) {
  const ahora = new Date();
  const wrapped = (ahora.getMonth() === 10 && ahora.getDate() >= 20) || ahora.getMonth() === 11 || (ahora.getMonth() === 0 && ahora.getDate() <= 15);
  return (
    <Seccion id="recreo" titulo="Un respiro">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Efemeride />
        <EmojiDelEstudio />
        <MiniPaleta d={d} />
        <TusNumeros />
        <ModoFoco />
        <div className="grid min-w-0 grid-cols-1 content-start gap-3">
          <Tip />
          {wrapped && <WrappedTeaser />}
        </div>
      </div>
    </Seccion>
  );
}

/* ───────────── Un día como hoy ───────────── */

function Efemeride() {
  const [x, setX] = useState<ReturnType<typeof efemerideDe>>(null);
  useEffect(() => setX(efemerideDe()), []);
  if (!x) return <div className={cn(CAJA, "min-h-[12rem] p-5")} />;
  return (
    <div className={cn(CAJA, "grain relative flex min-h-[12rem] flex-col overflow-hidden border-transparent bg-ink p-5 text-cream")}>
      <p className="site-label relative text-cream/55">{encabezadoEfemeride(x)}</p>
      <p className="relative mt-3 font-display text-[1.9rem] leading-[1.05] tracking-[-0.01em]">{x.e.texto}</p>
      <span className="relative mt-auto pt-4 font-display text-[3.5rem] leading-none text-primary/90">{x.e.anio}</span>
    </div>
  );
}

/* ───────────── Tip del día ───────────── */

function Tip() {
  const [tip, setTip] = useState<ReturnType<typeof tipDelDia> | null>(null);
  useEffect(() => setTip(tipDelDia()), []);
  if (!tip) return null;
  const esBuscador = tip.href === "/" && /⌘K/.test(tip.texto);
  return (
    <div className={cn(CAJA, "p-4")}>
      <p className="eyebrow flex items-center gap-1.5">
        <Lightbulb className="h-3 w-3" /> El tip de hoy
      </p>
      <p className="mt-2 text-[14.5px] leading-snug">{tip.texto}</p>
      {esBuscador ? (
        <button type="button" onClick={() => abrirBuscador()} className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold">
          {tip.accion} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : tip.href !== "/" ? (
        <Link href={tip.href} className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold">
          {tip.accion} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

/* ───────────── El emoji del estudio y el mini buscador ───────────── */

function EmojiDelEstudio() {
  const [emoji, setEmoji] = useState<EmojiEstudio | null | undefined>(undefined);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<EmojiEntry[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    emojiDelEstudio().then(setEmoji);
  }, []);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setResultados([]);
      return;
    }
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/emojis/search?q=${encodeURIComponent(t)}&limit=16`, { signal: ctl.signal });
        const j = (await r.json().catch(() => ({}))) as { emojis?: EmojiEntry[] };
        if (!ctl.signal.aborted) setResultados(j.emojis ?? []);
      } catch {
        /* cancelada */
      } finally {
        if (!ctl.signal.aborted) setBuscando(false);
      }
    }, 300);
    return () => {
      clearTimeout(id);
      ctl.abort();
    };
  }, [q]);

  const copiar = async (char: string) => {
    await copyEmojiText(char);
    registrarUso("emoji", { detalle: char });
    toast(`Copiado ${char}`);
  };

  return (
    <div className={cn(CAJA, "flex flex-col p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">El emoji del estudio</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {emoji
              ? `El más copiado ${emoji.desde === hoyISO(new Date(Date.now() - 86_400_000)) ? "ayer" : "de la semana"}: ${emoji.veces} ${emoji.veces === 1 ? "vez" : "veces"}${emoji.personas > 1 ? `, por ${emoji.personas} personas` : ""}.`
              : emoji === null
                ? "Todavía nadie copió uno. ¡Estrenalo!"
                : "Contando…"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => emoji && copiar(emoji.emoji)}
          disabled={!emoji}
          className="text-[3.25rem] leading-none transition-transform hover:scale-110 disabled:opacity-40"
          aria-label={emoji ? `Copiar ${emoji.emoji}` : undefined}
        >
          {emoji?.emoji ?? "🫠"}
        </button>
      </div>
      <label className="mt-4 flex h-10 items-center gap-2 rounded-full border bg-background/60 px-3 focus-within:border-foreground/30">
        {buscando ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Search className="h-4 w-4 text-muted-foreground" />}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscá un emoji y copialo…" className="min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:ring-0 focus-visible:ring-offset-0" />
      </label>
      {resultados.length > 0 ? (
        <div className="mt-3 grid grid-cols-8 gap-1">
          {resultados.map((e) => (
            <button key={e.i} type="button" title={e.n} onClick={() => copiar(charFor(e, 0))} className="grid aspect-square place-items-center rounded-lg hover:bg-foreground/[0.06]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(e.i)} alt={e.n} className="h-7 w-7" loading="lazy" />
            </button>
          ))}
        </div>
      ) : (
        <Link href="/library/emojis" className="mt-3 text-[13px] text-muted-foreground hover:text-foreground">
          Todos los emojis →
        </Link>
      )}
    </div>
  );
}

/* ───────────── ¿De quién es esta paleta? (una sola) ───────────── */

function MiniPaleta({ d }: { d: DatosInicio }) {
  const jugables = useMemo(() => marcasJugables(d.clients), [d.clients]);
  const [p, setP] = useState<Pregunta | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [racha, setRacha] = useState(0);

  useEffect(() => {
    if (!p && jugables.length >= 2) setP(nuevaPregunta(jugables, d.clients));
  }, [jugables, d.clients, p]);

  const otra = () => {
    setElegida(null);
    setP(nuevaPregunta(jugables, d.clients, p ? [p.respuesta.id] : []));
  };

  return (
    <div className={cn(CAJA, "flex flex-col p-5")}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="eyebrow">¿De quién es esta paleta?</p>
        {racha > 1 && <span className="text-[12px] font-semibold">🔥 {racha} seguidas</span>}
      </div>
      {!p ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Hay pocas marcas con paleta cargada ({jugables.length}) para jugar. Cargá los colores en la ficha de cada cliente y se arma solo.
          <Link href="/clientes" className="mt-2 block font-medium text-foreground underline underline-offset-2">
            Ir a Clientes
          </Link>
        </p>
      ) : (
        <>
          <div className="mt-3 flex h-16 overflow-hidden rounded-xl ring-1 ring-inset ring-foreground/10">
            {p.colores.map((c) => (
              <span key={c} className="flex-1" style={{ background: c }} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {p.opciones.map((o) => {
              const bien = o.id === p.respuesta.id;
              const mostrar = elegida != null;
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={mostrar}
                  onClick={() => {
                    setElegida(o.id);
                    setRacha((r) => (bien ? r + 1 : 0));
                  }}
                  className={cn(
                    "flex h-11 items-center gap-2 rounded-xl border px-2 text-left text-[13px] font-medium transition-colors",
                    !mostrar && "hover:border-foreground/30",
                    mostrar && bien && "border-transparent bg-[color:var(--tono-finalizada)] text-white",
                    mostrar && !bien && elegida === o.id && "border-transparent bg-[color:var(--tono-vencida)] text-white",
                    mostrar && !bien && elegida !== o.id && "opacity-45"
                  )}
                >
                  {mostrar && bien && <ClientMark brand={o} className="h-7 w-7 rounded-md text-[8px]" pad="p-[14%]" />}
                  <span className="truncate">{o.name}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-3">
            <span className="text-[13px] text-muted-foreground">
              {elegida == null ? "Elegí una." : elegida === p.respuesta.id ? "¡Bien ahí!" : `Era ${p.respuesta.name}.`}
            </span>
            <span className="flex items-center gap-2">
              {elegida != null && (
                <button type="button" onClick={otra} className="text-[13px] font-semibold">
                  Otra
                </button>
              )}
              <Link href="/rest/paleta" className="text-[13px] font-semibold underline-offset-2 hover:underline">
                Contrarreloj →
              </Link>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────── Tus números del mes ───────────── */

function TusNumeros() {
  const [n, setN] = useState<Numeros | null | undefined>(undefined);
  useEffect(() => {
    const hoy = new Date();
    misNumeros(new Date(hoy.getFullYear(), hoy.getMonth(), 1)).then(setN);
  }, []);
  const mes = new Date().toLocaleDateString("es-UY", { month: "long" });

  const filas = n
    ? ([
        n.emojis > 0 && { k: "emojis", valor: n.emojis.toLocaleString("es-UY"), texto: `emojis copiados${n.emoji_favorito ? ` (tu favorito: ${n.emoji_favorito})` : ""}` },
        n.conversiones + n.compresiones > 0 && {
          k: "conv",
          valor: (n.conversiones + n.compresiones).toLocaleString("es-UY"),
          texto: `archivos convertidos o comprimidos${n.bytes_convertidos ? ` · ${pesoLegible(n.bytes_convertidos)}` : ""}`,
        },
        n.descargas > 0 && { k: "desc", valor: n.descargas.toLocaleString("es-UY"), texto: `descargas${n.bytes_bajados ? ` · ${pesoLegible(n.bytes_bajados)}` : ""}` },
        n.retoques > 0 && { k: "ret", valor: n.retoques.toLocaleString("es-UY"), texto: "fondos quitados" },
        n.banners > 0 && { k: "ban", valor: n.banners.toLocaleString("es-UY"), texto: "banners exportados" },
        n.gifs + n.iconos > 0 && { k: "lib", valor: (n.gifs + n.iconos).toLocaleString("es-UY"), texto: "GIFs e íconos de las librerías" },
        n.tarjetas + n.redacciones > 0 && { k: "txt", valor: (n.tarjetas + n.redacciones).toLocaleString("es-UY"), texto: "textos copiados de Tarjetas y Redacción" },
        n.partidas > 0 && { k: "jug", valor: n.partidas.toLocaleString("es-UY"), texto: "partidas en Rest (nadie te juzga)" },
      ].filter(Boolean) as { k: string; valor: string; texto: string }[])
    : [];

  return (
    <div className={cn(CAJA, "flex flex-col p-5")}>
      <p className="eyebrow">Tus números de {mes}</p>
      {n === undefined ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-8 rounded-lg" />
          ))}
        </div>
      ) : !n ? (
        <p className="mt-3 text-sm text-muted-foreground">Todavía no hay números para mostrar en este entorno.</p>
      ) : (
        <>
          <p className="mt-2 font-display text-[2.6rem] leading-none">
            {n.dias} <span className="text-[1.3rem] text-muted-foreground">{n.dias === 1 ? "día" : "días"} con Herramientas</span>
          </p>
          <ul className="mt-3 space-y-1.5">
            {filas.slice(0, 5).map((f) => (
              <li key={f.k} className="flex items-baseline gap-2 text-sm">
                <strong className="w-14 shrink-0 text-right font-semibold tabular-nums">{f.valor}</strong>
                <span className="text-muted-foreground">{f.texto}</span>
              </li>
            ))}
            {!filas.length && <li className="text-sm text-muted-foreground">Copiá un emoji, convertí un archivo o bajá un video y acá se va sumando.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

/* ───────────── Modo foco y vacaciones ───────────── */

function ModoFoco() {
  const { foco, restante } = useFoco();
  const { perfil } = useMiPerfil();
  const { ajustes, cambiar } = useAjustesInicio();
  const [avisar, setAvisar] = useState(true);
  const vacaciones = ajustes.vacaciones;
  const faltan = vacaciones ? diasHasta(vacaciones) : null;

  const arrancar = (min: number) => {
    empezarFoco(min);
    toast(`Modo foco: ${min} minutos. ¡A darle!`);
    // Que el estudio sepa: el estado se borra solo cuando termina.
    if (avisar && perfil) {
      guardarMiPerfil({ estado_emoji: "🎧", estado_texto: "En modo foco", estado_vence: new Date(Date.now() + min * 60_000).toISOString() });
    }
  };

  return (
    <div className={cn(CAJA, "flex flex-col p-5")}>
      <p className="eyebrow flex items-center gap-1.5">
        <Target className="h-3 w-3" /> Modo foco
      </p>
      {foco ? (
        <div className="mt-2 flex items-center gap-3">
          {foco.fase === "pausa" ? <Coffee className="h-8 w-8" /> : <Target className="h-8 w-8" />}
          <p className="font-display text-[2.6rem] tabular-nums leading-none">{reloj(restante)}</p>
          <p className="text-sm text-muted-foreground">{foco.fase === "pausa" ? "de pausa" : "de foco"}: lo seguís abajo a la izquierda.</p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">Un pomodoro que sigue corriendo aunque cambies de herramienta. Con el Jam de fondo, mejor.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[25, 50, 15].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => arrancar(m)}
                className={cn(
                  "h-10 rounded-full px-4 text-sm font-semibold transition-transform hover:scale-[1.03]",
                  m === 25 ? "bg-ink text-cream dark:bg-cream dark:text-ink" : "border border-foreground/15 bg-card"
                )}
              >
                {m} min
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
            <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
            Avisarle al estudio (estado 🎧 «En modo foco» hasta que termine)
          </label>
        </>
      )}
      <div className="mt-auto border-t border-foreground/[0.07] pt-3">
        <label className="flex flex-wrap items-center gap-2 text-[13px]">
          <Palmtree className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{faltan != null && faltan > 0 ? `Faltan ${faltan} días para tus vacaciones` : "¿Cuándo te vas de vacaciones?"}</span>
          <input
            type="date"
            value={vacaciones ?? ""}
            min={hoyISO()}
            onChange={(e) => cambiar({ vacaciones: e.target.value || null })}
            className="ml-auto h-8 rounded-lg border bg-background px-2 text-[13px]"
          />
        </label>
      </div>
    </div>
  );
}

/* ───────────── Wrapped ───────────── */

function WrappedTeaser() {
  const anio = new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  return (
    <Link href="/wrapped" className="group relative block overflow-hidden rounded-2xl bg-primary p-5 text-ink">
      <span aria-hidden className="absolute -bottom-12 -right-3 font-display text-[8rem] leading-none text-ink/[0.08] transition-transform duration-700 group-hover:-rotate-6">
        {String(anio).slice(2)}
      </span>
      <p className="site-label relative text-ink/60">
        <Sparkles className="mr-1 inline h-3 w-3" /> Wrapped {anio}
      </p>
      <p className="relative mt-2 font-display text-[2rem] leading-[1.02]">Tu año en Herramientas, en historias.</p>
      <span className="relative mt-3 inline-flex items-center gap-1 text-[13px] font-semibold">
        Verlo <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
