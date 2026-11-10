"use client";

import type { ReactNode } from "react";
import type { EstadoJam } from "@/lib/spotify/types";
import { cn } from "@/lib/utils";
import { apagado, resplandor, vidrio } from "./estilo";
import { Ecualizador, Onda, Tapa } from "./piezas";

/**
 * Lo que suena en el Jam. No tiene play, pausa ni saltear: la música la maneja el DJ desde su
 * Spotify. `acciones` va abajo (Unirse, QR, cola) y `esquina` arriba a la derecha (minimizar).
 */
export function JamAhora({
  estado,
  posicion,
  grande = false,
  acciones,
  esquina,
  className,
}: {
  estado: EstadoJam;
  posicion: number;
  grande?: boolean;
  acciones?: ReactNode;
  esquina?: ReactNode;
  className?: string;
}) {
  const c = estado.actual;
  const titulo = !estado.dispositivo
    ? "El Jam está en pausa"
    : estado.sonando
      ? "Sonando en el Jam"
      : "En pausa";

  return (
    <section aria-label="Lo que suena en el Jam" className={cn(vidrio, grande ? "p-6 sm:p-8" : "p-4", className)}>
      <span aria-hidden className={cn(resplandor, "-bottom-20 left-1/2 h-40 w-3/4 -translate-x-1/2")} />
      <span aria-hidden className={cn(resplandor, "-left-16 -top-16 h-32 w-32 bg-[#1ed760]/15")} />

      <div className={cn("flex items-center", grande ? "gap-6" : "gap-4")}>
        <Tapa src={c?.portada ?? null} className={cn(grande ? "h-32 w-32 rounded-3xl sm:h-40 sm:w-40" : "h-[72px] w-[72px] rounded-2xl")} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#1ed760]">
            <Ecualizador sonando={estado.sonando} />
            {titulo}
          </p>
          {c ? (
            <>
              <p className={cn("mt-1.5 truncate font-bold leading-tight", grande ? "text-3xl sm:text-4xl" : "text-lg")}>{c.nombre}</p>
              <p className={cn("mt-1 truncate", apagado, grande ? "text-base" : "text-[13px]")}>
                {c.artistas}
                <span aria-hidden className="mx-1.5">•</span>
                {c.album}
              </p>
            </>
          ) : (
            <p className={cn("mt-1.5", apagado, grande ? "text-base" : "text-sm")}>
              {estado.aviso ?? `En el Spotify de ${estado.dj?.nombre ?? "el DJ"} no suena nada todavía.`}
            </p>
          )}
        </div>
        {esquina}
      </div>

      {c && <Onda uri={c.uri} posicion={posicion} duracion={c.duracion} barras={grande ? 72 : 46} className={grande ? "mt-6" : "mt-3"} />}
      {c && estado.aviso && <p className="mt-2 text-xs text-[#ff8a8a]">{estado.aviso}</p>}
      {acciones && <div className={cn("flex items-center gap-3", grande ? "mt-6" : "mt-3")}>{acciones}</div>}
    </section>
  );
}
