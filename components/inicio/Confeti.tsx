"use client";

import { useEffect, useRef } from "react";

const COLORES = ["#FFD600", "#EBE7DD", "#FF5C39", "#5B8CFF", "#2BD4A4", "#FF8AD8"];

/**
 * Confeti en un canvas que tapa al que lo contiene (que tiene que ser relative). Cae una vez, unos
 * segundos; con «reducir movimiento» no se dibuja. `disparo` lo vuelve a tirar al cambiar.
 */
export function Confeti({ disparo = 0, cantidad = 140 }: { disparo?: number; cantidad?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const piezas = Array.from({ length: cantidad }, () => ({
      x: width * (0.2 + Math.random() * 0.6),
      y: height * 0.15 + Math.random() * 20,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 9 - 3,
      giro: Math.random() * Math.PI,
      vgiro: (Math.random() - 0.5) * 0.3,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      color: COLORES[Math.floor(Math.random() * COLORES.length)],
    }));

    let raf = 0;
    const inicio = performance.now();
    const cuadro = (t: number) => {
      const pasado = t - inicio;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, pasado - 3200) / 1200);
      for (const p of piezas) {
        p.vy += 0.22;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.giro += p.vgiro;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.giro * 2)));
        ctx.restore();
      }
      if (pasado < 4400) raf = requestAnimationFrame(cuadro);
      else ctx.clearRect(0, 0, width, height);
    };
    raf = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(raf);
  }, [disparo, cantidad]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-20 h-full w-full" />;
}
