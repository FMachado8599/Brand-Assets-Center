"use client";

import { useEffect, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { CAPTION_BOTTOM, MEDIA_BOTTOM, MEDIA_H, MEDIA_TOP, META_SAFE, SCREEN, type AdMedia } from "@/lib/ads/reel";
import type { AdColors } from "@/lib/ads/color";
import { cn } from "@/lib/utils";
import {
  BackIcon,
  ChevronIcon,
  CommentIcon,
  FollowBadgeIcon,
  HeartIcon,
  MoreIcon,
  PersonGlyph,
  RepostIcon,
  ShareIcon,
  StatusIcons,
} from "./ReelIcons";

export const BEZEL = 11;
export const PHONE = { w: SCREEN.w + BEZEL * 2, h: SCREEN.h + BEZEL * 2 };

/** Las tipografías del sistema: en un iPhone es SF Pro, como en Instagram. */
export const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif';

let measurer: CanvasRenderingContext2D | null = null;

/**
 * La línea del texto como la corta Instagram: hasta la última palabra que entra al lado de "Publicidad" y
 * " ..." si queda algo afuera (o si el texto sigue en otra línea).
 */
export function captionLine(caption: string, measure: boolean) {
  const lines = caption.trim().split("\n");
  const first = lines[0].trim();
  const more = lines.length > 1;
  // Antes de montar (en el servidor) no se puede medir: lo mismo de los dos lados, sin cortar.
  if (!measure) return more ? `${first} ...` : first;
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) return first;
  const width = (text: string, weight = 400) => {
    measurer!.font = `${weight} 15px ${FONT}`;
    return measurer!.measureText(text).width;
  };
  const max = SCREEN.w - 16 - 17 - 12 - width("Publicidad", 600);
  if (!more && width(first) <= max) return first;
  let out = "";
  for (const word of first.split(/\s+/)) {
    const next = out ? `${out} ${word}` : word;
    if (width(`${next} ...`) > max) break;
    out = next;
  }
  return `${out} ...`;
}

/** Las caras de las burbujas (posición del centro y tono), como en la captura: la del medio va más arriba. */
export const BUBBLES = [
  { x: 37, y: 572, tone: "#7d8b99" },
  { x: 100, y: 558, tone: "#9c8b7a" },
  { x: 160, y: 573, tone: "#8a9483" },
];

/** Los íconos del costado: centro vertical de cada uno. */
export const RAIL = [
  { y: 507, Icon: HeartIcon, name: "heart", label: "Me gusta" },
  { y: 554, Icon: CommentIcon, name: "comment", label: "Comentar" },
  { y: 601, Icon: RepostIcon, name: "repost", label: "Compartir en tu perfil" },
  { y: 649, Icon: ShareIcon, name: "share", label: "Enviar" },
  { y: 693, Icon: MoreIcon, name: "more", label: "Más opciones" },
] as const;

export type ReelMockupProps = {
  media: AdMedia | null;
  /** Si el creativo no es 9:16: llenar la pantalla (recorta) o entero con fondo. */
  fit: "cover" | "contain";
  account: string;
  avatar: ReactNode;
  caption: string;
  cta: string;
  colors: AdColors;
  /** Las caras de gente que sigue a la cuenta, arriba del botón. */
  social: boolean;
  /** Toda la interfaz de Instagram encima del creativo. */
  showUI: boolean;
  /** Marca en rojo cada cosa de la interfaz que va encima del creativo. */
  mark: boolean;
  /** La zona segura de la Guía de anuncios de Meta. */
  safeZone: boolean;
  time: string;
  scale: number;
  /** El creativo que se ve (la imagen o el video, en el cuadro en que está), para dibujarlo al descargar. */
  mediaRef?: Ref<HTMLImageElement & HTMLVideoElement>;
};

/** Lo que tapa al creativo: con "mark", queda marcado en rojo. */
function Covers({ mark, className, style, children }: { mark: boolean; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div
      className={cn("absolute", mark && "rounded-[6px] bg-red-500/30 outline outline-2 outline-red-500", className)}
      style={style}
    >
      {children}
    </div>
  );
}

function Media({ media, fit, mediaRef }: Pick<ReelMockupProps, "media" | "fit" | "mediaRef">) {
  if (!media) {
    return (
      <div className="grid h-full w-full place-items-center bg-[#1b1b1f] px-10 text-center text-[15px] leading-snug text-white/45">
        Tu imagen o video va acá (9:16)
      </div>
    );
  }
  const show = (className: string, hidden?: boolean) =>
    media.kind === "video" ? (
      <video ref={hidden ? undefined : mediaRef} src={media.url} autoPlay muted loop playsInline aria-hidden={hidden} className={className} />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img ref={hidden ? undefined : mediaRef} src={media.url} alt="" aria-hidden={hidden} className={className} />
    );
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Fuera del 9:16, de fondo la misma imagen desenfocada (el relleno es una aproximación). */}
      {fit === "contain" && show("absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl", true)}
      {show(cn("relative h-full w-full", fit === "cover" ? "object-cover" : "object-contain"))}
    </div>
  );
}

function SafeZone() {
  const top = MEDIA_H * META_SAFE.top;
  const bottom = MEDIA_H * META_SAFE.bottom;
  const side = SCREEN.w * META_SAFE.side;
  const hatch: CSSProperties = {
    background: "repeating-linear-gradient(135deg, rgba(250,204,21,.38) 0 6px, rgba(250,204,21,.14) 6px 12px)",
  };
  return (
    <div className="pointer-events-none absolute inset-x-0" style={{ top: MEDIA_TOP, height: MEDIA_H }} aria-hidden>
      <div className="absolute inset-x-0 top-0" style={{ ...hatch, height: top }} />
      <div className="absolute inset-x-0 bottom-0" style={{ ...hatch, height: bottom }} />
      <div className="absolute left-0" style={{ ...hatch, top, bottom, width: side }} />
      <div className="absolute right-0" style={{ ...hatch, top, bottom, width: side }} />
      <div className="absolute border-2 border-dashed border-yellow-300" style={{ top, bottom, left: side, right: side }}>
        <span className="absolute left-1 top-1 rounded bg-yellow-300 px-1.5 py-0.5 text-[11px] font-semibold text-black">
          Zona segura de Meta
        </span>
      </div>
    </div>
  );
}

/**
 * Un iPhone con un anuncio en Reels de Instagram, en tamaño real de pantalla (390 × 844 pt) y escalado.
 * Todo lo que Instagram pone encima del creativo está en su lugar, para ver qué tapa.
 */
export function ReelMockup(props: ReelMockupProps) {
  const { media, fit, account, avatar, caption, cta, colors, social, showUI, mark, safeZone, time, scale, mediaRef } = props;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const firstLine = captionLine(caption, mounted);

  return (
    <div style={{ width: PHONE.w * scale, height: PHONE.h * scale }} className="shrink-0">
      <div
        className="relative origin-top-left rounded-[58px] bg-[#0d0d0f] shadow-[0_30px_80px_-20px_rgba(0,0,0,.45),inset_0_0_0_2px_#2c2c30]"
        style={{ width: PHONE.w, height: PHONE.h, padding: BEZEL, transform: `scale(${scale})` }}
      >
        <div
          className="relative overflow-hidden rounded-[47px] text-white antialiased"
          style={{ width: SCREEN.w, height: SCREEN.h, fontFamily: FONT, background: "#0b1014" }}
        >
          {/* Franjas: arriba (detrás de la hora) y la del texto del posteo. */}
          <div className="absolute inset-x-0 top-0" style={{ height: MEDIA_TOP, background: colors.band }} />
          <div className="absolute inset-x-0" style={{ top: MEDIA_BOTTOM, height: CAPTION_BOTTOM - MEDIA_BOTTOM, background: colors.captionBand }} />

          <div className="absolute inset-x-0" style={{ top: MEDIA_TOP, height: MEDIA_H }}>
            <Media media={media} fit={fit} mediaRef={mediaRef} />
            {showUI && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.18), transparent 14%, transparent 58%, rgba(0,0,0,.32))" }}
              />
            )}
          </div>

          {safeZone && <SafeZone />}

          {/* Notch y barra de estado. */}
          <div className="absolute left-1/2 top-0 h-[32px] w-[162px] -translate-x-1/2 rounded-b-[20px] bg-black" aria-hidden />
          <div className="absolute left-0 top-[14px] flex h-[30px] w-[114px] items-center justify-center text-[17px] font-semibold tracking-[-0.02em]">
            {time}
          </div>
          <div className="absolute left-[279px] top-[14px] flex h-[30px] items-center">
            <StatusIcons />
          </div>

          {showUI && (
            <>
              <Covers mark={mark} style={{ left: 24, top: 70, width: 26, height: 26 }}>
                <BackIcon size={26} />
              </Covers>

              <Covers mark={mark} style={{ left: 342, top: 489, width: 34, height: 222 }}>
                {RAIL.map(({ y, Icon, label }) => (
                  <span key={label} className="absolute left-[2px] -translate-y-1/2" style={{ top: y - 489 }} title={label}>
                    <Icon size={30} />
                  </span>
                ))}
              </Covers>

              {social && (
                <Covers mark={mark} style={{ left: 14, top: 535, width: 198, height: 69 }}>
                  {BUBBLES.map((b, i) => (
                    <span key={i} className="absolute" style={{ left: b.x - 22 - 14, top: b.y - 22 - 535 }}>
                      <span
                        className="grid h-[44px] w-[44px] place-items-end justify-center overflow-hidden rounded-full"
                        style={{ background: `linear-gradient(160deg, ${b.tone}, #3b3f46)` }}
                      >
                        <span className="text-white/70">
                          <PersonGlyph size={36} />
                        </span>
                      </span>
                      <span className="absolute left-[28px] top-[29px] grid h-[21px] w-[21px] place-items-center rounded-full bg-[#696ddb] text-white ring-[1.5px] ring-white/80">
                        <FollowBadgeIcon size={13} />
                      </span>
                    </span>
                  ))}
                </Covers>
              )}

              <Covers mark={mark} style={{ left: 16, top: 612, width: 307, height: 46 }}>
                <div
                  className="flex h-full items-center justify-between rounded-[9px] pl-4 pr-3 text-[15.5px] font-semibold"
                  style={{ background: colors.cta }}
                >
                  <span className="truncate">{cta}</span>
                  <ChevronIcon size={20} />
                </div>
              </Covers>

              <Covers mark={mark} className="flex items-center gap-[8.5px]" style={{ left: 16, top: 677, height: 36, maxWidth: 320 }}>
                <span className="grid h-[35.5px] w-[35.5px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#2a3442] ring-1 ring-white/25">
                  {avatar}
                </span>
                <span className="truncate text-[16px] font-semibold tracking-[-0.01em]">{account || "tu.marca"}</span>
              </Covers>

              <div className="absolute flex items-center justify-between gap-3 text-[15px]" style={{ left: 16, right: 17, top: 722, height: 22 }}>
                <span className="min-w-0 overflow-hidden whitespace-nowrap">{firstLine}</span>
                <span className="shrink-0 font-semibold">Publicidad</span>
              </div>

              <div className="absolute flex items-center rounded-full bg-[#181c1f] pl-5 text-[17px] text-[#b2b3b5]" style={{ left: 16, top: 771, width: 358, height: 46 }}>
                Agrega un comentario...
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
