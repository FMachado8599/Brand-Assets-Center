"use client";

import { useRef, useState } from "react";
import {
  Bookmark,
  Camera,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { medidaDe } from "@/lib/plani/config";
import { copyTexto } from "@/lib/plani/copy";
import type { Medio, Pieza, Plataforma, Sticker } from "@/lib/plani/types";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { esVideo, FormatIcon, useMedioUrl, usuarioDe, useVistaCliente } from "./bits";
import { StickerLayer } from "./Stickers";

/**
 * Cómo se va a ver cada pieza publicada: el post en el feed, el carrusel, el reel y la historia,
 * con el logo del cliente como foto de perfil y el copy de la plataforma elegida. Mientras no hay
 * material final, se ve lo que pidió redacción.
 */

export type MockupBrand = Pick<Brand, "name" | "color" | "logo_url" | "logo_bg">;

export type MockupProps = {
  pieza: Pieza;
  brand: MockupBrand;
  plataforma?: Plataforma;
  className?: string;
  /** La pieza que adapta (una historia que adapta un post o un reel): sin material propio, muestra el de ella. */
  fuente?: Pieza | null;
  /** Historias: mover los stickers arrastrándolos (diseño). */
  onStickers?: (next: Sticker[]) => void;
  stickerSel?: string | null;
  onStickerSel?: (id: string | null) => void;
  /** Click en una imagen: para abrirla grande. */
  onOpen?: (medio: Medio) => void;
};

export const finales = (p: Pick<Pieza, "medios">) => p.medios.filter((m) => m.rol === "final");
export const portadaDe = (p: Pick<Pieza, "medios">) => p.medios.find((m) => m.rol === "portada") ?? null;

/** El copy de la pieza (uno solo para todas las redes; las planis de antes podían tener uno por red). */
export function copyDe(p: Pieza, _plataforma?: Plataforma) {
  return copyTexto(p);
}

export function Mockup(props: MockupProps) {
  switch (props.pieza.formato) {
    case "post":
      return <PostMockup {...props} />;
    case "carrusel":
      return <CarouselMockup {...props} />;
    case "reel":
      return <ReelMockup {...props} />;
    case "historia":
      return <StoryMockup {...props} />;
    case "banner":
      return <BannerMockup {...props} />;
  }
}

/**
 * Un banner de display (programática): el GIF o la imagen a su medida, sobre un fondo neutro, como
 * se va a ver en la página. Mientras no hay diseño, lo que pidió redacción.
 */
function BannerMockup({ pieza, onOpen, className }: MockupProps) {
  const medioUrl = useMedioUrl();
  const m = pieza.medios.find((x) => x.rol === "final") ?? null;
  const { w, h } = medidaDe(pieza);
  return (
    <div className={cn("w-full", className)}>
      <div className="rounded-2xl border border-black/[0.06] bg-[#ececee] p-4">
        <div className="mx-auto w-full overflow-hidden bg-white shadow-sm" style={{ maxWidth: Math.min(w, 560), aspectRatio: `${w} / ${h}` }}>
          {m ? (
            // El original (no la miniatura): así el GIF se mueve.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={medioUrl(m)}
              alt={pieza.titulo || "Banner"}
              onClick={onOpen ? () => onOpen(m) : undefined}
              className={cn("h-full w-full object-contain", onOpen && "cursor-zoom-in")}
            />
          ) : (
            <div className="grid h-full w-full place-items-center border-2 border-dashed border-black/10 p-2 text-center text-[11px] leading-snug text-muted-foreground">
              {pieza.instrucciones || "Diseño pendiente"}
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Banner {w}×{h} px{m ? ` · ${Math.round(m.tamano / 1024)} KB` : ""}
      </p>
    </div>
  );
}

/* ───────────── Piezas sueltas ───────────── */

function Avatar({ brand, className }: { brand: MockupBrand; className?: string }) {
  return (
    <span className={cn("rounded-full bg-gradient-to-tr from-[#fccc63] via-[#e95950] to-[#8a3ab9] p-[2px]", className)}>
      <ClientMark brand={brand} className="h-full w-full rounded-full text-[9px] ring-2 ring-white" pad="p-[16%]" />
    </span>
  );
}

function Placeholder({ pieza, dark, slide }: { pieza: Pieza; dark?: boolean; slide?: number }) {
  const cliente = useVistaCliente();
  const texto = cliente
    ? pieza.titulo
    : pieza.formato === "carrusel"
    ? pieza.slides[slide ?? 0]?.instruccion || pieza.instrucciones
    : pieza.instrucciones;
  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col justify-between overflow-hidden p-[7%]",
        dark ? "bg-[#1b1b1f] text-white/80" : "bg-[#f3f0e8] text-black/70"
      )}
    >
      {/* La barra invertida de la marca, de fondo. */}
      <span aria-hidden className={cn("pointer-events-none absolute -right-[10%] top-0 h-full w-[38%] -skew-x-[22deg]", dark ? "bg-white/[0.04]" : "bg-[#ffd100]/25")} />
      <span className="relative flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
        <FormatIcon formato={pieza.formato} className="h-3 w-3" /> {cliente ? "En diseño" : "Diseño pendiente"}
      </span>
      <p className="relative line-clamp-[7] whitespace-pre-line font-display text-[clamp(0.95rem,4.5cqw,1.6rem)] leading-tight">
        {texto || (cliente ? "" : pieza.titulo || "Sin indicaciones todavía")}
      </p>
      <span className="relative text-[10px] font-medium opacity-55">
        {medidaDe(pieza).label} · {medidaDe(pieza).w}×{medidaDe(pieza).h}
      </span>
    </div>
  );
}

function ImageView({ medio, onOpen, w = 1080, contain }: { medio: Medio; onOpen?: (m: Medio) => void; w?: number; contain?: boolean }) {
  const url = useMedioUrl();
  const [loaded, setLoaded] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url(medio, w)}
      alt={medio.nombre}
      draggable={false}
      onLoad={() => setLoaded(true)}
      onClick={onOpen ? () => onOpen(medio) : undefined}
      className={cn(
        "h-full w-full transition-opacity duration-300",
        contain ? "object-contain" : "object-cover",
        loaded ? "opacity-100" : "opacity-0",
        onOpen && "cursor-zoom-in"
      )}
    />
  );
}

/**
 * Un video como en el feed: arranca quieto, con un botón de play claro (se agranda al pasar el
 * mouse). Click en cualquier lado lo pausa o lo sigue; abajo, la barra de avance; arriba, el sonido.
 */
function VideoView({ medio, poster }: { medio: Medio; poster: Medio | null }) {
  const url = useMedioUrl();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      setLoading(true);
      v.play().catch(() => setLoading(false));
    } else v.pause();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={playing ? "Pausar el video" : "Reproducir el video"}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          toggle();
        }
      }}
      className="group/video relative h-full w-full cursor-pointer outline-none"
    >
      <video
        ref={ref}
        src={url(medio)}
        poster={url(poster ?? medio, 720)}
        muted={muted}
        loop
        playsInline
        preload="none"
        onPlaying={() => {
          setPlaying(true);
          setLoading(false);
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration) setProgress(v.currentTime / v.duration);
        }}
        className="h-full w-full object-cover"
      />
      <span
        className={cn(
          "pointer-events-none absolute inset-0 z-[5] grid place-items-center transition-opacity duration-200",
          playing && !loading ? "opacity-0 group-hover/video:opacity-100 group-focus-visible/video:opacity-100" : "opacity-100"
        )}
      >
        <span
          className={cn(
            "grid h-14 w-14 place-items-center rounded-full bg-black/45 text-white shadow-lg ring-1 ring-white/40 transition-[transform,background-color] duration-200 ease-smooth",
            "group-hover/video:scale-110 group-hover/video:bg-black/65 group-active/video:scale-95 group-focus-visible/video:ring-2 group-focus-visible/video:ring-primary"
          )}
        >
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : playing ? (
            <Pause className="h-5 w-5 fill-current" />
          ) : (
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          )}
        </span>
      </span>
      <button
        type="button"
        aria-label={muted ? "Activar el sonido" : "Silenciar"}
        title={muted ? "Activar el sonido" : "Silenciar"}
        onClick={(e) => {
          e.stopPropagation();
          setMuted((m) => !m);
        }}
        className="absolute right-3 top-14 z-30 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white opacity-80 transition hover:scale-105 hover:bg-black/70 hover:opacity-100"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[3px] bg-white/25">
        <span className="block h-full bg-white" style={{ width: `${progress * 100}%` }} />
      </span>
    </div>
  );
}

function Media({ pieza, medio, onOpen, dark }: { pieza: Pieza; medio: Medio | undefined; onOpen?: (m: Medio) => void; dark?: boolean }) {
  if (!medio) return <Placeholder pieza={pieza} dark={dark} />;
  if (esVideo(medio)) return <VideoView medio={medio} poster={portadaDe(pieza)} />;
  return <ImageView medio={medio} onOpen={onOpen} />;
}

function Caption({ usuario, texto, dark }: { usuario: string; texto: string; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!texto) return <p className={cn("text-[12.5px] italic", dark ? "text-white/50" : "text-black/40")}>Sin copy todavía</p>;
  return (
    <p className={cn("whitespace-pre-line text-[12.5px] leading-snug", !open && "line-clamp-2")} onClick={() => setOpen((v) => !v)}>
      <b className="font-semibold">{usuario}</b> {texto}
    </p>
  );
}

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.4rem] border border-black/[0.08] bg-white text-black shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_50px_-30px_rgba(40,30,10,0.45)]",
        className
      )}
      style={{ containerType: "inline-size" }}
    >
      {children}
    </div>
  );
}

function Header({ brand, usuario, extra }: { brand: MockupBrand; usuario: string; extra?: string }) {
  return (
    <header className="flex items-center gap-2 px-3 py-2.5">
      <Avatar brand={brand} className="h-8 w-8" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-semibold">{usuario}</span>
        {extra && <span className="block truncate text-[11px] text-black/50">{extra}</span>}
      </span>
      <MoreHorizontal className="h-4 w-4 text-black/70" />
    </header>
  );
}

function Actions({ dots }: { dots?: React.ReactNode }) {
  return (
    <div className="relative flex items-center gap-3.5 px-3 pt-2.5">
      <Heart className="h-[22px] w-[22px]" />
      <MessageCircle className="h-[22px] w-[22px] -scale-x-100" />
      <Send className="h-[21px] w-[21px]" />
      {dots && <span className="absolute left-1/2 top-[1.1rem] -translate-x-1/2">{dots}</span>}
      <Bookmark className="ml-auto h-[22px] w-[22px]" />
    </div>
  );
}

const ratio = (p: Pieza) => (p.proporcion === "1:1" ? "1 / 1" : p.proporcion === "16:9" ? "16 / 9" : p.proporcion === "9:16" ? "9 / 16" : "4 / 5");

/* ───────────── Feed ───────────── */

function PostMockup({ pieza, brand, plataforma, className, onOpen }: MockupProps) {
  const usuario = usuarioDe(brand.name);
  return (
    <Frame className={className}>
      <Header brand={brand} usuario={usuario} />
      <div className="relative bg-neutral-100" style={{ aspectRatio: ratio(pieza) }}>
        <Media pieza={pieza} medio={finales(pieza)[0]} onOpen={onOpen} />
      </div>
      <Actions />
      <div className="px-3 pb-3.5 pt-2">
        <Caption usuario={usuario} texto={copyDe(pieza, plataforma)} />
      </div>
    </Frame>
  );
}

function CarouselMockup({ pieza, brand, plataforma, className, onOpen }: MockupProps) {
  const usuario = usuarioDe(brand.name);
  const imgs = finales(pieza);
  const total = Math.max(imgs.length, pieza.slides.length, 1);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const ir = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <Frame className={className}>
      <Header brand={brand} usuario={usuario} />
      <div className="group relative bg-neutral-100" style={{ aspectRatio: ratio(pieza) }}>
        <div
          ref={track}
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
          className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto"
        >
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className="h-full w-full shrink-0 snap-center">
              {imgs[i] ? <ImageView medio={imgs[i]} onOpen={onOpen} /> : <Placeholder pieza={pieza} slide={i} />}
            </div>
          ))}
        </div>
        {total > 1 && (
          <>
            <span className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
              {index + 1}/{total}
            </span>
            {index > 0 && (
              <button
                type="button"
                aria-label="Slide anterior"
                onClick={() => ir(index - 1)}
                className="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black opacity-0 shadow transition-opacity group-hover:opacity-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {index < total - 1 && (
              <button
                type="button"
                aria-label="Slide siguiente"
                onClick={() => ir(index + 1)}
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black opacity-0 shadow transition-opacity group-hover:opacity-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>
      <Actions
        dots={
          total > 1 && (
            <span className="flex gap-1">
              {Array.from({ length: Math.min(total, 10) }, (_, i) => (
                <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i === index ? "bg-[#3a7bfd]" : "bg-black/20")} />
              ))}
            </span>
          )
        }
      />
      <div className="px-3 pb-3.5 pt-2">
        <Caption usuario={usuario} texto={copyDe(pieza, plataforma)} />
      </div>
    </Frame>
  );
}

/* ───────────── Vertical ───────────── */

function Vertical({ children, className, dark = true }: { children: React.ReactNode; className?: string; dark?: boolean }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.4rem] shadow-[0_24px_50px_-30px_rgba(0,0,0,0.6)]",
        dark ? "bg-black text-white" : "bg-[#111] text-white",
        className
      )}
      style={{ aspectRatio: "9 / 16", containerType: "inline-size" }}
    >
      {children}
    </div>
  );
}

function ReelMockup({ pieza, brand, plataforma, className }: MockupProps) {
  const usuario = usuarioDe(brand.name);
  const video = finales(pieza)[0];
  const portada = portadaDe(pieza);
  return (
    <Vertical className={className}>
      {video ? <Media pieza={pieza} medio={video} dark /> : portada ? <ImageView medio={portada} /> : <Placeholder pieza={pieza} dark />}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/45 to-transparent px-3.5 pb-6 pt-3">
        <span className="text-[15px] font-bold">Reels</span>
        <Camera className="h-5 w-5" />
      </div>
      <div className="pointer-events-none absolute bottom-0 right-0 z-10 flex flex-col items-center gap-3.5 px-2.5 pb-16 text-[10px] font-medium">
        {[Heart, MessageCircle, Send].map((Icon, i) => (
          <Icon key={i} className={cn("h-6 w-6", i === 1 && "-scale-x-100")} />
        ))}
        <MoreHorizontal className="h-5 w-5" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-4 pr-12 pt-10">
        <div className="flex items-center gap-2">
          <Avatar brand={brand} className="h-7 w-7" />
          <span className="truncate text-[13px] font-semibold">{usuario}</span>
          <span className="rounded-md border border-white/60 px-1.5 py-px text-[11px] font-semibold">Seguir</span>
        </div>
        <p className="mt-2 line-clamp-2 whitespace-pre-line text-[12px] leading-snug text-white/90">{copyDe(pieza, plataforma) || "Sin copy todavía"}</p>
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-white/80">
          <Music2 className="h-3 w-3" /> {usuario} · Audio original
        </p>
      </div>
    </Vertical>
  );
}

/**
 * La portada de un reel, más grande: entera en vertical y, marcado, el recorte 3:4 que muestra el
 * perfil (lo de afuera se ve más oscuro).
 */
export function PortadaMockup({ pieza, className, onOpen }: { pieza: Pieza; className?: string; onOpen?: (m: Medio) => void }) {
  const portada = portadaDe(pieza);
  return (
    <Vertical className={className}>
      {portada ? <ImageView medio={portada} onOpen={onOpen} /> : <Placeholder pieza={pieza} dark />}
      {/* 3:4 sobre 9:16: el recorte ocupa el ancho entero y 75% × 9/16 del alto, centrado. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[29.69%] bg-black/55" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[29.69%] bg-black/55" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[29.69%] h-[40.62%] ring-1 ring-inset ring-white/70" />
      <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[10.5px] font-medium text-white/80">Recorte del perfil (3:4)</span>
    </Vertical>
  );
}

function StoryChrome({ brand, usuario }: { brand: MockupBrand; usuario: string }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/40 to-transparent px-2.5 pb-8 pt-2">
        <div className="flex gap-1">
          <span className="h-[2px] flex-1 rounded-full bg-white/90" />
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <ClientMark brand={brand} className="h-7 w-7 rounded-full text-[9px] ring-1 ring-white/30" pad="p-[16%]" />
          <span className="truncate text-[13px] font-semibold">{usuario}</span>
          <span className="text-[12px] text-white/70">2 h</span>
          <MoreHorizontal className="ml-auto h-4 w-4" />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center gap-3 bg-gradient-to-t from-black/40 to-transparent px-3 pb-3 pt-8">
        <span className="flex-1 rounded-full border border-white/70 px-3.5 py-2 text-[12px] text-white/90">Enviar mensaje</span>
        <Heart className="h-6 w-6" />
        <Send className="h-[22px] w-[22px]" />
      </div>
    </>
  );
}

/**
 * Un post o un reel compartido en historia, como lo arma Instagram: la publicación en una tarjeta
 * sobre un fondo del color del cliente (si la historia no tiene diseño propio).
 */
function Compartido({ fuente, brand }: { fuente: Pieza; brand: MockupBrand }) {
  const url = useMedioUrl();
  const medio = fuente.formato === "reel" ? portadaDe(fuente) ?? finales(fuente)[0] : finales(fuente)[0];
  const usuario = usuarioDe(brand.name);
  return (
    <div className="relative grid h-full w-full place-items-center p-[12%]" style={{ background: `linear-gradient(160deg, ${brand.color}, #111 85%)` }}>
      <div className="w-full overflow-hidden rounded-xl bg-white text-black shadow-2xl">
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <ClientMark brand={brand} className="h-5 w-5 rounded-full text-[7px]" pad="p-[16%]" />
          <span className="truncate text-[10px] font-semibold">{usuario}</span>
        </div>
        <div className="bg-neutral-100" style={{ aspectRatio: fuente.formato === "reel" ? "9 / 16" : ratio(fuente) }}>
          {medio ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url(medio, 720)} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <Placeholder pieza={fuente} />
          )}
        </div>
      </div>
    </div>
  );
}

function StoryMockup({ pieza, brand, className, fuente, onStickers, stickerSel, onStickerSel, onOpen }: MockupProps) {
  const usuario = usuarioDe(brand.name);
  const propio = finales(pieza)[0];
  // Sin material propio, una historia que adapta un reel muestra el reel; una que adapta un post, el post compartido.
  const delReel = !propio && fuente?.formato === "reel" ? finales(fuente)[0] : undefined;
  return (
    <Vertical className={className} dark={false}>
      {propio ? (
        <Media pieza={pieza} medio={propio} onOpen={onStickers ? undefined : onOpen} dark />
      ) : delReel ? (
        <Media pieza={fuente!} medio={delReel} dark />
      ) : fuente ? (
        <Compartido fuente={fuente} brand={brand} />
      ) : (
        <Placeholder pieza={pieza} dark />
      )}
      <StickerLayer
        stickers={pieza.stickers}
        fechaPieza={pieza.fecha}
        usuario={usuario}
        onChange={onStickers}
        selected={stickerSel}
        onSelect={onStickerSel}
      />
      <StoryChrome brand={brand} usuario={usuario} />
    </Vertical>
  );
}

/** El tamaño del mockup al lado del panel: los verticales más angostos que los del feed. */
export const anchoMockup = (p: Pick<Pieza, "formato">) => (p.formato === "reel" || p.formato === "historia" ? "max-w-[15.5rem]" : "max-w-[19rem]");
