"use client";

import { useEffect, useRef } from "react";
import { Coffee, Music2, Pause, Play, Square, Target } from "lucide-react";
import { useAccount } from "@/components/shell/AccountProvider";
import { Hint } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toaster";
import { abrirJam } from "@/components/spotify/jam/JamBurbuja";
import { useSpotifyJam } from "@/hooks/useSpotifyJam";
import { empezarFoco, pausarFoco, reloj, seguirFoco, sonarCampana, terminarFoco, useFoco } from "@/lib/inicio/foco";
import { cn } from "@/lib/utils";
import { MarcaActivaPildora } from "./MarcaActiva";

/** Lo que flota abajo a la izquierda en toda la app: el modo foco (si corre) y el modo marca (si está prendido). */
export function Flotantes() {
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-30 flex flex-col items-start gap-2 sm:bottom-4 sm:left-4">
      <FocoPildora />
      <MarcaActivaPildora />
    </div>
  );
}

const BOTON = "grid h-8 w-8 place-items-center rounded-full text-cream/60 transition-colors hover:bg-cream/10 hover:text-cream";

function FocoPildora() {
  const { foco, restante, terminado } = useFoco();
  const account = useAccount();
  const { estado } = useSpotifyJam(Boolean(foco && account?.user), 30_000);
  const avisado = useRef<number | null>(null);

  // Al terminar: suena, avisa y queda esperando que elijas qué sigue.
  useEffect(() => {
    if (!terminado || !foco || avisado.current === foco.fin) return;
    avisado.current = foco.fin;
    sonarCampana();
    toast(foco.fase === "foco" ? "¡Terminó el foco! Tomate 5 minutos." : "Se terminó la pausa: ¿otro foco?");
  }, [terminado, foco]);

  // La cuenta en la pestaña, para verla desde otra ventana.
  useEffect(() => {
    if (!foco) return;
    const original = document.title.replace(/^(⏳|☕|✅) [\d:]+ · /, "");
    const icono = terminado ? "✅" : foco.fase === "foco" ? "⏳" : "☕";
    document.title = `${icono} ${reloj(restante)} · ${original}`;
    return () => {
      document.title = document.title.replace(/^(⏳|☕|✅) [\d:]+ · /, "");
    };
  }, [foco, restante, terminado]);

  if (!foco) return null;
  const total = foco.minutos * 60_000;
  const avance = Math.min(1, Math.max(0, 1 - restante / total));
  const pausa = foco.fase === "pausa";
  const cancion = estado?.sonando ? estado.actual : null;

  return (
    <div className="floating-ink pointer-events-auto flex h-11 items-center gap-1.5 rounded-full py-1 pl-1 pr-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
      <span className="relative grid h-9 w-9 shrink-0 place-items-center">
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r="16" fill="none" strokeWidth="3" className="stroke-cream/10" />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className={pausa ? "stroke-emerald-400" : "stroke-primary"}
            strokeDasharray={`${avance * 100.5} 100.5`}
          />
        </svg>
        {pausa ? <Coffee className="h-4 w-4" /> : <Target className="h-4 w-4" />}
      </span>
      <span className="min-w-[3.6rem] leading-tight">
        <span className="block text-[9.5px] font-medium uppercase tracking-[0.14em] text-cream/50">
          {terminado ? "Listo" : pausa ? "Pausa" : `Foco ${foco.vueltas > 1 ? `· ${foco.vueltas}º` : ""}`}
        </span>
        <span className="block text-[15px] font-semibold tabular-nums">{reloj(restante)}</span>
      </span>

      {cancion && !terminado && (
        <Hint label="Abrir el Jam">
          <button
            type="button"
            onClick={() => abrirJam()}
            className="hidden max-w-[9.5rem] items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-cream/65 transition-colors hover:bg-cream/10 hover:text-cream sm:flex"
          >
            <Music2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{cancion.nombre}</span>
          </button>
        </Hint>
      )}

      {terminado ? (
        <>
          <button
            type="button"
            onClick={() => empezarFoco(pausa ? 25 : 5, pausa ? "foco" : "pausa")}
            className="h-8 rounded-full bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground transition-transform hover:scale-[1.03]"
          >
            {pausa ? "Otro foco" : "Pausa de 5"}
          </button>
          <Hint label="Terminar">
            <button type="button" onClick={terminarFoco} aria-label="Terminar el modo foco" className={BOTON}>
              <Square className="h-3.5 w-3.5" />
            </button>
          </Hint>
        </>
      ) : (
        <>
          <Hint label={foco.pausado != null ? "Seguir" : "Pausar"}>
            <button
              type="button"
              onClick={foco.pausado != null ? seguirFoco : pausarFoco}
              aria-label={foco.pausado != null ? "Seguir" : "Pausar"}
              className={cn(BOTON, foco.pausado != null && "text-primary")}
            >
              {foco.pausado != null ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
          </Hint>
          <Hint label="Terminar">
            <button type="button" onClick={terminarFoco} aria-label="Terminar el modo foco" className={BOTON}>
              <Square className="h-3.5 w-3.5" />
            </button>
          </Hint>
        </>
      )}
    </div>
  );
}
