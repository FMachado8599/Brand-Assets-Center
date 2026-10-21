"use client";

import { useEffect, useRef } from "react";
import { frameOf, placementInfo } from "@/lib/ads/placements";
import { SCREEN } from "@/lib/ads/reel";
import { cn } from "@/lib/utils";
import { BEZEL, PHONE, drawMockup, type MockupInput } from "./draw";

export type MockupViewProps = Omit<MockupInput, "source"> & {
  scale: number;
  /** El <img>/<video> que se ve, para descargar este mockup en el cuadro en que está. */
  onSource?: (el: HTMLImageElement | HTMLVideoElement | null) => void;
};

/**
 * Un teléfono con el anuncio: el creativo va en un <img>/<video> (así los videos se reproducen) y encima un
 * canvas con todo lo de Instagram, dibujado con lo mismo que la imagen que se descarga.
 */
export function MockupView({ scale, onSource, ...input }: MockupViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const f = frameOf(input.placement, input.media);
  const { media, fit } = input;

  // Se redibuja en cada cambio (es un dibujo chico).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(PHONE.w * scale * dpr);
    const h = Math.round(PHONE.h * scale * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.scale(scale * dpr, scale * dpr);
    drawMockup(ctx, { ...input, source: null });
  });

  const show = (className: string, main: boolean) =>
    media!.kind === "video" ? (
      <video
        ref={main ? onSource : undefined}
        src={media!.url}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden={!main}
        className={className}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img ref={main ? onSource : undefined} src={media!.url} alt="" aria-hidden={!main} className={className} />
    );

  return (
    <div
      className="relative shrink-0 shadow-[0_30px_80px_-20px_rgba(0,0,0,.45)]"
      style={{ width: PHONE.w * scale, height: PHONE.h * scale, borderRadius: 58 * scale }}
    >
      <div
        className="absolute overflow-hidden bg-[#1b1b1f]"
        style={{ left: BEZEL * scale, top: (BEZEL + f.top) * scale, width: SCREEN.w * scale, height: f.height * scale, borderRadius: f.radius * scale }}
      >
        {media ? (
          <>
            {/* Fuera del 9:16, de fondo el mismo creativo desenfocado (el relleno es una aproximación). */}
            {fit === "contain" && show("absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl", false)}
            {show(cn("relative h-full w-full", fit === "cover" ? "object-cover" : "object-contain"), true)}
          </>
        ) : (
          <div className="grid h-full w-full place-items-center px-6 text-center text-white/45" style={{ fontSize: 15 * scale }}>
            Tu imagen o video va acá (9:16)
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" role="img" aria-label={`Mockup: ${placementInfo(input.placement).label}`} />
    </div>
  );
}
