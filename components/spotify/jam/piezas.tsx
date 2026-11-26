"use client";

import { useEffect, useState } from "react";
import { Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { minutos } from "./estilo";

/** Las barritas de "sonando". Se mueven solo si suena y si la persona no pidió menos movimiento. */
export function Ecualizador({ sonando, className }: { sonando: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex h-3 items-end gap-[2px]", className)}>
      <style>{`
        @keyframes jam-eq { 0%, 100% { transform: scaleY(0.35) } 50% { transform: scaleY(1) } }
        .jam-eq > i { animation: jam-eq 0.9s ease-in-out infinite; transform-origin: bottom; }
        @media (prefers-reduced-motion: reduce) { .jam-eq > i { animation: none; } }
      `}</style>
      <span className={cn("inline-flex h-full items-end gap-[2px]", sonando && "jam-eq")}>
        {[0.55, 1, 0.7, 0.85].map((alto, i) => (
          <i
            key={i}
            className="block w-[3px] rounded-full bg-[#1ed760]"
            style={{ height: `${alto * 100}%`, animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
    </span>
  );
}

/** Alturas que parecen una onda, siempre las mismas para cada canción (son decorativas). */
function alturas(semilla: string, n: number) {
  let h = 2166136261;
  for (let i = 0; i < semilla.length; i++) h = Math.imul(h ^ semilla.charCodeAt(i), 16777619);
  return Array.from({ length: n }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const ruido = ((h >>> 0) % 1000) / 1000;
    // Una envolvente suave para que no sea ruido puro: más alto en el medio de cada "frase".
    const forma = 0.55 + 0.45 * Math.sin((i / n) * Math.PI * 3 + semilla.length);
    return 0.18 + 0.82 * Math.min(1, ruido * 0.6 + forma * 0.5);
  });
}

/**
 * El progreso como una onda: lo que ya sonó en verde, con brillo. La forma no sale del audio (Spotify
 * no lo da): es un dibujo fijo para cada canción. Abajo, los tiempos.
 */
export function Onda({
  uri,
  posicion,
  duracion,
  barras = 46,
  className,
}: {
  uri: string;
  posicion: number;
  duracion: number;
  barras?: number;
  className?: string;
}) {
  const fraccion = duracion ? Math.min(1, posicion / duracion) : 0;
  const hs = alturas(uri, barras);
  return (
    <div className={className}>
      <div
        className="flex h-8 items-center gap-[2px]"
        role="progressbar"
        aria-label="Progreso de la canción"
        aria-valuemin={0}
        aria-valuemax={Math.round(duracion / 1000)}
        aria-valuenow={Math.round(posicion / 1000)}
        aria-valuetext={`${minutos(posicion)} de ${minutos(duracion)}`}
      >
        {hs.map((h, i) => {
          const hecho = (i + 0.5) / barras <= fraccion;
          return (
            <span
              key={i}
              className={cn(
                "w-full min-w-[2px] flex-1 rounded-full transition-colors duration-500",
                hecho ? "bg-[#1ed760] shadow-[0_0_8px_rgba(30,215,96,0.55)]" : "bg-white/15"
              )}
              style={{ height: `${h * 100}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-[#b3b3b3]">
        <span>{minutos(posicion)}</span>
        <span>{minutos(duracion)}</span>
      </div>
    </div>
  );
}

/** La tapa del disco con su luz: una copia borrosa detrás, como un reflejo. */
export function Tapa({ src, className, luz = true }: { src: string | null; className?: string; luz?: boolean }) {
  return (
    <div className={cn("relative shrink-0", className)}>
      {src && luz && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 rounded-[inherit] object-cover opacity-60 blur-xl" />
      )}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="relative h-full w-full rounded-[inherit] object-cover shadow-[0_12px_30px_-10px_rgba(0,0,0,0.8)]" />
      ) : (
        <div className="relative grid h-full w-full place-items-center rounded-[inherit] bg-[#282828] text-[#7a7a7a]">
          <Music className="h-1/3 w-1/3" />
        </div>
      )}
    </div>
  );
}

/** Re-render periódico mientras `activo`, para que el progreso avance solo. */
export function useTic(activo: boolean, cadaMs = 1000) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!activo) return;
    const id = setInterval(() => setN((n) => n + 1), cadaMs);
    return () => clearInterval(id);
  }, [activo, cadaMs]);
}
