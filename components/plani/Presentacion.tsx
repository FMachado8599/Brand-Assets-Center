"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Expand, FolderOpen, MessageSquare, Shrink, X } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { BarButton, BarDivider, BarNote, ContextBar } from "@/components/shell/ContextBar";
import { useClients } from "@/hooks/useClients";
import { useComentarios } from "@/hooks/useComentarios";
import { useTipos } from "@/hooks/useTipos";
import { usePlani } from "@/hooks/usePlani";
import { APROBACION, MESES, nombreFormato, plataformaInfo } from "@/lib/plani/config";
import { etiquetaDia, horaCorta } from "@/lib/plani/fechas";
import type { Aprobacion, Comentario, Medio, Pieza, Plani } from "@/lib/plani/types";
import type { Brand } from "@/lib/types";
import { STUDIO } from "@/lib/site";
import { cn } from "@/lib/utils";
import { HiloComentarios, pendientes } from "./Comentarios";
import { Lightbox } from "./Lightbox";
import { copyDe, finales, Mockup, portadaDe, PortadaMockup, type MockupBrand } from "./Mockups";
import { AnuncioMockup } from "./AnuncioMockup";
import type { Herramienta } from "@/lib/plani/tipos";
import { HerramientasProvider, useHerramientas } from "./herramientas";
import { Calendario, FeedGrid } from "./Overview";
import { PlatformIcon } from "./PlatformIcon";

gsap.registerPlugin(useGSAP);

export type PresentacionPlani = Pick<Plani, "id" | "anio" | "mes" | "drive_carpeta_id">;

type Props = {
  plani: PresentacionPlani;
  /** El nombre del tipo ("Planificación", "Leads / Ads"…): el título de la portada. */
  tipoNombre: string;
  piezas: Pieza[];
  brand: MockupBrand;
  modo: "estudio" | "cliente";
  comentarios: Comentario[];
  onComentar: (piezaId: string | null, texto: string, paraCliente: boolean) => Promise<boolean>;
  onResolver?: (id: string, resuelto: boolean) => void;
  onBorrar?: (id: string) => void;
  yo?: string | null;
  /** Cliente: aprobar una pieza o pedir cambios. */
  onAprobar?: (piezaId: string, estado: Aprobacion) => void;
  /** Cliente: su nombre para firmar los comentarios. */
  nombre?: { value: string; onChange: (v: string) => void };
  /** Estudio: volver al editor (la barra de la app). */
  onVolver?: () => void;
};

/**
 * La presentación como la ve el cliente: lo que antes era la de Google Slides, armado solo con lo que
 * ya está cargado. Portada, calendario, feed y una página por pieza con su mockup, el copy, el
 * enlace al material, la hora, los estados y el sello de programada. Se recorre con las flechas
 * (o la rueda) y se puede poner en pantalla completa (F). Es la misma para el estudio y para el
 * cliente (en su link): el cliente comenta y aprueba; el estudio ve además lo interno.
 */
export function PresentacionVista({ herramientas = [], ...props }: Props & { herramientas?: Herramienta[] }) {
  return (
    <HerramientasProvider value={herramientas}>
      <Vista {...props} />
    </HerramientasProvider>
  );
}

function Vista({ plani, tipoNombre, piezas, brand, modo, comentarios, onComentar, onResolver, onBorrar, yo, onAprobar, nombre, onVolver }: Props) {
  const deck = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);
  const [full, setFull] = useState(false);
  const [lightbox, setLightbox] = useState<{ medios: Medio[]; index: number } | null>(null);
  /** El panel de comentarios abierto: el id de la pieza, "" para los generales, null cerrado. */
  const [hilo, setHilo] = useState<string | null>(null);

  const porId = useMemo(() => new Map(piezas.map((p) => [p.id, p])), [piezas]);
  const total = piezas.length + 4;
  const porPieza = useMemo(() => {
    const map = new Map<string, Comentario[]>();
    for (const c of comentarios) map.set(c.pieza_id ?? "", [...(map.get(c.pieza_id ?? "") ?? []), c]);
    return map;
  }, [comentarios]);

  const ir = useCallback((i: number) => {
    const slides = deck.current?.querySelectorAll<HTMLElement>("[data-slide]");
    if (!slides?.length) return;
    slides[Math.max(0, Math.min(slides.length - 1, i))].scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const root = deck.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActual(Number((e.target as HTMLElement).dataset.slide));
      },
      { root, threshold: 0.55 }
    );
    root.querySelectorAll("[data-slide]").forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [piezas.length]);

  const pantallaCompleta = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else deck.current?.parentElement?.requestFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lightbox) return;
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.key === "Escape" && hilo !== null) return setHilo(null);
      if (["ArrowDown", "PageDown", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
        ir(actual + 1);
      } else if (["ArrowUp", "PageUp", "ArrowLeft"].includes(e.key)) {
        e.preventDefault();
        ir(actual - 1);
      } else if (e.key === "Home") ir(0);
      else if (e.key === "End") ir(total - 1);
      else if (e.key.toLowerCase() === "f") pantallaCompleta();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actual, total, ir, pantallaCompleta, lightbox, hilo]);

  const abrir = (m: Medio, p: Pieza) => {
    const lista = m.rol === "portada" ? [m] : finales(p);
    setLightbox({ medios: lista, index: Math.max(0, lista.findIndex((x) => x.id === m.id)) });
  };

  const pie = `${brand.name} · ${tipoNombre} ${MESES[plani.mes - 1]} ${plani.anio}`;
  const drive = modo === "estudio" && plani.drive_carpeta_id ? `https://drive.google.com/drive/folders/${plani.drive_carpeta_id}` : null;
  const piezaHilo = hilo ? porId.get(hilo) ?? null : null;
  const generales = porPieza.get("") ?? [];

  const controles = (
    <>
      <BarButton label="Anterior (↑)" icon={ChevronUp} onClick={() => ir(actual - 1)} disabled={actual === 0} />
      <BarNote className="inline">
        {String(actual + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </BarNote>
      <BarButton label="Siguiente (↓)" icon={ChevronDown} onClick={() => ir(actual + 1)} disabled={actual >= total - 1} />
      <BarDivider />
      <BarButton
        label="Comentarios generales"
        icon={MessageSquare}
        badge={(modo === "estudio" ? pendientes(comentarios) : generales.length) || undefined}
        onClick={() => setHilo(hilo === "" ? null : "")}
        pressed={hilo === ""}
      />
      <BarButton label={full ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"} icon={full ? Shrink : Expand} onClick={pantallaCompleta} />
    </>
  );

  return (
    <div className="relative bg-background">
      {modo === "estudio" ? (
        <ContextBar>
          <BarButton label="Volver al editor" icon={ArrowLeft} onClick={onVolver} />
          <BarDivider />
          <span className="flex items-center gap-2 px-1.5">
            <ClientMark brand={brand} className="h-7 w-7 rounded-full text-[10px]" pad="p-[18%]" />
            <span className="hidden text-sm font-semibold text-cream sm:inline">
              {brand.name} · {MESES[plani.mes - 1]}
            </span>
          </span>
          <BarDivider />
          {controles}
        </ContextBar>
      ) : (
        // En el link del cliente no está la barra de la app: los controles flotan abajo.
        <div className="floating-ink fixed bottom-4 left-1/2 z-40 flex h-[50px] -translate-x-1/2 items-center gap-1 rounded-full p-1.5">{controles}</div>
      )}

      <div ref={deck} className="no-scrollbar h-[100svh] snap-y snap-mandatory overflow-y-auto overscroll-contain">
        <Portada n={0} cliente={brand} titulo={tipoNombre} mes={MESES[plani.mes - 1]} anio={plani.anio} />

        <Slide n={1} pie={pie}>
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col justify-center gap-6 px-5 pb-16 pt-24 sm:px-10">
            <div className="flex items-end justify-between gap-4">
              <h2 className="font-display text-[clamp(3rem,7vw,5.5rem)] leading-none">Calendario</h2>
              <span className="rounded-[50%] border border-ink px-6 py-2 font-display text-3xl uppercase leading-none">{MESES[plani.mes - 1].slice(0, 3)}</span>
            </div>
            <Calendario anio={plani.anio} mes={plani.mes} piezas={piezas} onDia={(f) => ir(3 + piezas.findIndex((p) => p.fecha === f))} />
          </div>
        </Slide>

        <Slide n={2} pie={pie}>
          <div className="mx-auto grid h-full w-full max-w-6xl items-center gap-10 px-5 pb-16 pt-24 sm:px-10 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="font-display text-[clamp(3rem,7vw,5.5rem)] leading-none">Feed</h2>
              <p className="mt-4 max-w-sm text-sm text-muted-foreground">Así queda el perfil con las publicaciones del mes, lo más nuevo arriba.</p>
            </div>
            <div className="w-[min(24rem,80vw)] rounded-[1.75rem] border border-black/[0.08] bg-white p-3 shadow-[0_30px_60px_-35px_rgba(40,30,10,0.5)]">
              <div className="mb-3 flex items-center gap-3 px-1">
                <ClientMark brand={brand} className="h-12 w-12 rounded-full text-xs ring-2 ring-white" pad="p-[16%]" />
                <span className="text-sm font-semibold text-black">{brand.name}</span>
              </div>
              <FeedGrid piezas={piezas} onPieza={(pid) => ir(3 + piezas.findIndex((p) => p.id === pid))} />
            </div>
          </div>
        </Slide>

        {piezas.map((p, i) => {
          const fuente = p.adapta_de ? porId.get(p.adapta_de) ?? null : null;
          const hiloPieza = porPieza.get(p.id) ?? [];
          return (
            <Slide key={p.id} n={3 + i} pie={pie}>
              <PiezaSlide
                pieza={p}
                fuente={fuente}
                brand={brand}
                drive={drive}
                modo={modo}
                comentariosCount={modo === "estudio" ? pendientes(hiloPieza) : hiloPieza.length}
                onComentarios={() => setHilo(hilo === p.id ? null : p.id)}
                onAprobar={onAprobar}
                onOpen={(m) => abrir(m, p)}
              />
            </Slide>
          );
        })}

        <section data-slide={total - 1} className="relative flex h-[100svh] snap-start flex-col items-center justify-center gap-8 overflow-hidden bg-ink text-cream">
          <span aria-hidden className="pointer-events-none absolute -left-[8%] top-0 h-full w-[22%] -skew-x-[22deg] bg-primary/90" />
          <h2 className="relative font-display text-[clamp(4rem,14vw,11rem)] leading-none">¡Gracias!</h2>
          {modo === "cliente" && (
            <button
              type="button"
              onClick={() => setHilo("")}
              className="relative inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
            >
              <MessageSquare className="h-4 w-4" /> Dejar un comentario general
            </button>
          )}
          <span className="site-label absolute bottom-6 left-6 text-cream/50">
            {STUDIO} <span className="text-primary">\</span> {brand.name}
          </span>
        </section>
      </div>

      {hilo !== null && (
        <aside className="floating fixed bottom-20 right-3 top-20 z-40 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col rounded-[1.5rem] p-4 duration-200 animate-in fade-in-0 slide-in-from-right-4 sm:right-5">
          <div className="mb-3 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Comentarios</p>
              <p className="mt-1 truncate font-display text-2xl leading-tight">
                {piezaHilo ? `${etiquetaDia(piezaHilo.fecha)} · ${nombreFormato(piezaHilo.formato, piezaHilo.proporcion)}` : "Generales"}
              </p>
            </div>
            <button type="button" aria-label="Cerrar" onClick={() => setHilo(null)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <HiloComentarios
            className="min-h-0 flex-1"
            comentarios={porPieza.get(hilo) ?? []}
            modo={modo}
            yo={yo}
            nombre={nombre}
            vacio={modo === "cliente" ? "Escribí lo que quieras cambiar o comentar." : "Sin comentarios todavía."}
            onEnviar={(texto, paraCliente) => onComentar(hilo || null, texto, paraCliente)}
            onResolver={onResolver}
            onBorrar={onBorrar}
          />
        </aside>
      )}

      <Lightbox
        medios={lightbox?.medios ?? []}
        index={lightbox?.index ?? null}
        onIndex={(i) => setLightbox((l) => (l ? { ...l, index: i } : l))}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}

/** La presentación desde la app (estudio): lee la plani y sus comentarios con la sesión. */
export function Presentacion({ id }: { id: string }) {
  const router = useRouter();
  const { plani, piezas, loading, error } = usePlani(id);
  const { clients } = useClients();
  const comentarios = useComentarios(id);
  const brand = plani ? clients.find((c) => c.id === plani.brand_id) ?? null : null;
  const { tipoDe } = useTipos();
  const tipo = tipoDe(plani?.tipo ?? "");

  useEffect(() => {
    if (plani && brand) document.title = `${brand.name} · ${tipo.nombre} ${MESES[plani.mes - 1]} ${plani.anio}`;
  }, [plani, brand, tipo.nombre]);

  if (loading || !plani) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink text-cream/60">
        {error ? <p className="text-sm">{error}</p> : <span className="skeleton h-3 w-40 rounded-full opacity-20" />}
      </div>
    );
  }

  return (
    <PresentacionVista
      plani={plani}
      tipoNombre={tipo.nombre}
      herramientas={tipo.herramientas}
      piezas={piezas}
      brand={brand ?? { name: "Cliente", color: "#52525B", logo_url: null, logo_bg: "light" }}
      modo="estudio"
      comentarios={comentarios.items}
      onComentar={(piezaId, texto, paraCliente) => comentarios.comentar(piezaId, texto, !paraCliente)}
      onResolver={comentarios.resolver}
      onBorrar={comentarios.borrar}
      yo={comentarios.yo}
      onVolver={() => router.push(`/presentaciones/${id}`)}
    />
  );
}

function Slide({ n, pie, children }: { n: number; pie: string; children: React.ReactNode }) {
  return (
    <section data-slide={n} className="relative flex h-[100svh] snap-start flex-col overflow-hidden">
      {children}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 px-5 pb-4 text-[10px] font-medium uppercase tracking-[0.16em] text-ink/45 sm:px-10">
        <span>
          Cámara<span className="text-primary">\</span>TBWA
        </span>
        <span className="hidden sm:block">{pie}</span>
        <span className="tabular-nums">{String(n + 1).padStart(2, "0")}</span>
      </footer>
    </section>
  );
}

/** La portada: negro tinta, el corte amarillo que la descubre y el mes en grande. */
function Portada({ n, cliente, titulo, mes, anio }: { n: number; cliente: MockupBrand; titulo: string; mes: string; anio: number }) {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      // Abierta en una pestaña de fondo, el navegador no dibuja los cuadros: la portada queda quieta y completa.
      if (document.visibilityState === "hidden") {
        gsap.set(gsap.utils.selector(root)("[data-p='cut']"), { autoAlpha: 0 });
        return;
      }
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(root);
        gsap.set(q("[data-p='fade']"), { autoAlpha: 0, y: 16 });
        gsap.set(q("[data-p='rule']"), { scaleX: 0 });
        gsap
          .timeline({ defaults: { ease: "expo.out" } })
          .to(q("[data-p='cut']"), { xPercent: 105, duration: 1.15, ease: "expo.inOut" }, 0.1)
          .to(q("[data-p='rule']"), { scaleX: 1, duration: 1.2, ease: "expo.inOut" }, 0.7)
          .to(q("[data-p='fade']"), { autoAlpha: 1, y: 0, duration: 1, stagger: 0.1 }, 0.75);
      });
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(gsap.utils.selector(root)("[data-p='cut']"), { autoAlpha: 0 });
      });
    },
    { scope: root }
  );

  return (
    <section ref={root} data-slide={n} className="grain relative flex h-[100svh] snap-start flex-col justify-end overflow-hidden bg-ink px-5 pb-10 pt-28 text-cream sm:px-10 sm:pb-14">
      <span aria-hidden className="site-light pointer-events-none absolute -right-[20%] -top-[30%] h-[90vh] w-[90vh] rounded-full" />
      <div className="relative z-[2] mx-auto w-full max-w-6xl">
        <div data-p="fade" className="mb-8 flex items-center gap-4">
          <ClientMark brand={cliente} className="h-16 w-16 rounded-2xl text-lg sm:h-20 sm:w-20" pad="p-[14%]" />
          <span className="site-label text-cream/60">
            {cliente.name} <span className="text-primary">\</span> {STUDIO}
          </span>
        </div>
        <h1 className="font-display text-[clamp(3.6rem,13vw,11rem)] leading-[0.85] tracking-[-0.03em] [overflow-wrap:anywhere]">{titulo}</h1>
        <span data-p="rule" className="mt-6 block h-px origin-left bg-cream/30" />
        <p data-p="fade" className="mt-5 flex items-baseline gap-4 font-display text-[clamp(2rem,5vw,3.6rem)] leading-none">
          {mes} <em className="text-cream/40">{anio}</em>
        </p>
      </div>
      {/* El corte: tapa la portada desde el primer pintado y GSAP lo barre (se va solo si el JS no llega). */}
      <span aria-hidden data-p="cut" className="site-cut pointer-events-none absolute inset-y-0 -left-[10%] z-[3] w-[130%] -skew-x-[18deg] bg-primary" />
    </section>
  );
}

function PiezaSlide({
  pieza,
  fuente,
  brand,
  drive,
  modo,
  comentariosCount,
  onComentarios,
  onAprobar,
  onOpen,
}: {
  pieza: Pieza;
  fuente: Pieza | null;
  brand: MockupBrand;
  drive: string | null;
  modo: "estudio" | "cliente";
  comentariosCount: number;
  onComentarios: () => void;
  onAprobar?: (piezaId: string, estado: Aprobacion) => void;
  onOpen: (m: Medio) => void;
}) {
  const herramientas = useHerramientas();
  const vertical = pieza.formato === "reel" || pieza.formato === "historia";
  const copy = copyDe(pieza);
  const titulo = pieza.titulo || fuente?.titulo || "";
  const [verPortada, setVerPortada] = useState(false);
  const conPortada = pieza.formato === "reel" && !!portadaDe(pieza);

  return (
    <div className="mx-auto grid h-full w-full max-w-7xl grid-rows-[auto_1fr] gap-6 px-5 pb-14 pt-24 sm:px-10 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,16rem)] md:grid-rows-1 md:items-center md:gap-10">
      <div className="flex min-h-0 flex-col gap-5 md:h-full md:justify-between md:py-6">
        <div>
          <h2 className="font-display text-[clamp(2.4rem,5vw,4rem)] leading-none">{etiquetaDia(pieza.fecha)}</h2>
          {titulo && <p className="mt-3 text-sm text-muted-foreground">{titulo}</p>}
        </div>
        {copy && pieza.formato !== "historia" && (
          <div className="min-h-0 overflow-y-auto">
            <p className="eyebrow mb-2">Copy</p>
            <p className="whitespace-pre-line text-[15px] leading-relaxed">{copy}</p>
          </div>
        )}
        <p className="hidden font-display text-[clamp(2rem,4vw,3.2rem)] leading-none md:block">
          {pieza.formato === "historia" && fuente ? "Historia" : nombreFormato(pieza.formato, pieza.proporcion)}
        </p>
      </div>

      <div className={cn("mx-auto", vertical ? "w-[min(21rem,40vh,80vw)]" : "w-[min(25rem,50vh,86vw)]")}>
        {conPortada && (
          <div className="mb-2 flex justify-center gap-0.5">
            {[false, true].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setVerPortada(v)}
                className={cn("h-7 rounded-full px-3 text-xs font-medium", verPortada === v ? "bg-ink text-cream" : "text-muted-foreground hover:bg-secondary")}
              >
                {v ? "Portada" : "Reel"}
              </button>
            ))}
          </div>
        )}
        {conPortada && verPortada ? (
          <PortadaMockup pieza={pieza} onOpen={onOpen} />
        ) : herramientas.ads && pieza.formato !== "banner" ? (
          <AnuncioMockup pieza={pieza} brand={brand} ancho={320} onOpen={onOpen} />
        ) : (
          <Mockup pieza={pieza} brand={brand} fuente={fuente} onOpen={onOpen} />
        )}
      </div>

      <aside className="flex flex-col gap-4 md:h-full md:py-6">
        <div className="flex gap-2">
          {pieza.plataformas.map((p) => (
            <span key={p} title={plataformaInfo(p).label} className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-cream">
              <PlatformIcon platform={p} className="h-5 w-5" />
            </span>
          ))}
        </div>
        <dl className="divide-y divide-ink/15 border border-ink/15 bg-card/70 text-sm">
          {modo === "estudio" && (
            <Dato label="Enlace">
              {drive ? (
                <a href={drive} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 break-all text-[#1D4ED8] underline-offset-2 hover:underline">
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" /> Carpeta del material
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Dato>
          )}
          <Dato label="Hora">{pieza.hora ? `${horaCorta(pieza.hora)} h` : <span className="text-muted-foreground">—</span>}</Dato>
          {modo === "estudio" && <Dato label="Estado agencia">{APROBACION[pieza.estado_agencia].label}</Dato>}
          <Dato label="Estado cliente">{APROBACION[pieza.estado_cliente].label}</Dato>
        </dl>

        {modo === "cliente" && onAprobar && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onAprobar(pieza.id, pieza.estado_cliente === "aprobada" ? "pendiente" : "aprobada")}
              aria-pressed={pieza.estado_cliente === "aprobada"}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border text-sm font-semibold transition-colors",
                pieza.estado_cliente === "aprobada" ? "border-emerald-700 bg-emerald-700 text-white" : "border-ink/20 bg-card hover:bg-secondary"
              )}
            >
              <Check className="h-4 w-4" /> {pieza.estado_cliente === "aprobada" ? "Aprobada" : "Aprobar"}
            </button>
            <button
              type="button"
              onClick={() => {
                onAprobar(pieza.id, "cambios");
                onComentarios();
              }}
              aria-pressed={pieza.estado_cliente === "cambios"}
              className={cn(
                "inline-flex h-10 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                pieza.estado_cliente === "cambios" ? "border-destructive bg-destructive text-white" : "border-ink/20 bg-card hover:bg-secondary"
              )}
            >
              Pedir cambios
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onComentarios}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-ink/20 bg-card text-sm font-medium transition-colors hover:bg-secondary"
        >
          <MessageSquare className="h-4 w-4" /> Comentarios
          {comentariosCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold">{comentariosCount}</span>}
        </button>

        {pieza.programada && (
          <span className="w-fit -rotate-6 rounded-md border-[3px] border-emerald-700 px-3 py-1 font-display text-2xl uppercase tracking-wide text-emerald-700">Programado</span>
        )}
      </aside>
    </div>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink/60">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
