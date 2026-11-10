"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useStoredState } from "@/hooks/useStoredState";
import { ALTO, ANCHO, Motor, PASO_MS, type EstadoDino } from "@/lib/rest/dino/motor";
import { empezarPartida, mensaje, terminarPartida, type Resultado } from "@/lib/rest/partidas";
import { textoResultado } from "../Ranking";

const esSalto = (e: KeyboardEvent) => e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW";
const esAbajo = (e: KeyboardEvent) => e.code === "ArrowDown" || e.code === "KeyS";

/** Escribiendo o con el foco en otro control: ahí las teclas son de ese control, salvo en plena partida. */
function esDeOtro(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el || el === document.body) return false;
  if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return "escribiendo";
  return el.closest("button, a, [role=tab], [role=menuitem]") ? "control" : false;
}

/** Cómo terminó la última partida: el puntaje y qué dijo la base al guardarlo. */
type Final = { puntaje: number; guardando: boolean; resultado?: Resultado; error?: string };

/** Pausa para que un salto apurado no arranque otra partida apenas se choca. */
const ESPERA_REINICIO_MS = 600;

export function DinoGame({ mejor, onGuardada }: { mejor: number | null; onGuardada: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const motor = useRef<Motor | null>(null);
  const escala = useRef(1);
  const sucio = useRef(true);
  const partida = useRef<Promise<string | null> | null>(null);
  const finEn = useRef(0);
  const [estado, setEstado] = useState<EstadoDino>("listo");
  const [final, setFinal] = useState<Final | null>(null);
  const [mejorLocal, setMejorLocal] = useStoredState("rest:dino:mejor", 0);
  const record = Math.max(mejor ?? 0, mejorLocal) || null;
  const recordRef = useRef(record);
  recordRef.current = record;

  /** Lo que pasa al chocar. En un ref: lo llama el bucle de animación, que se arma una sola vez. */
  const alChocar = useRef<() => void>(() => {});
  alChocar.current = async () => {
    const m = motor.current!;
    const puntaje = m.puntaje;
    finEn.current = performance.now();
    setEstado("fin");
    if (puntaje > mejorLocal) setMejorLocal(puntaje);
    const abierta = partida.current;
    partida.current = null;
    setFinal({ puntaje, guardando: !!abierta });
    const id = abierta ? await abierta : null;
    if (!id) return setFinal({ puntaje, guardando: false });
    try {
      const resultado = await terminarPartida(id, puntaje);
      setFinal({ puntaje, guardando: false, resultado });
      onGuardada();
    } catch (e) {
      setFinal({ puntaje, guardando: false, error: mensaje(e) });
    }
  };

  const saltar = () => {
    const m = motor.current;
    if (!m) return;
    if (m.estado === "pausa") {
      m.seguir();
      setEstado("jugando");
      return;
    }
    if (m.estado === "fin") {
      if (performance.now() - finEn.current < ESPERA_REINICIO_MS) return;
      m.reiniciar();
      setFinal(null);
    }
    if (m.presionarSalto()) {
      setEstado("jugando");
      // Sin esperar: la base anota la hora de arranque y el id llega mientras se juega.
      partida.current = empezarPartida("dino", "");
    }
  };
  const saltarRef = useRef(saltar);
  saltarRef.current = saltar;

  // El canvas acompaña el ancho de la página, con la nitidez de la pantalla.
  useLayoutEffect(() => {
    const el = caja.current!;
    const medir = () => {
      const c = canvas.current;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const ancho = Math.round(el.clientWidth * dpr);
      c.width = ancho;
      c.height = Math.round((ancho * ALTO) / ANCHO);
      escala.current = ancho / ANCHO;
      sucio.current = true;
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // El bucle: pasos fijos de 1/60 s por el tiempo que pasó, y un cuadro por refresco de pantalla.
  useEffect(() => {
    const m = (motor.current ??= new Motor());
    const ctx = canvas.current!.getContext("2d")!;
    let raf = 0;
    let antes = performance.now();
    let acumulado = 0;
    const cuadro = (ahora: number) => {
      acumulado += Math.min(ahora - antes, 250);
      antes = ahora;
      let pasos = 0;
      while (acumulado >= PASO_MS && pasos < 8) {
        if (m.step()) alChocar.current();
        acumulado -= PASO_MS;
        pasos++;
      }
      if (pasos === 8) acumulado = 0;
      // Quieto (antes de arrancar, en pausa o después de chocar) no hace falta repintar.
      if (m.estado === "jugando" || sucio.current || pasos > 0) {
        m.dibujar(ctx, escala.current, recordRef.current);
        sucio.current = false;
      }
      raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    sucio.current = true;
  }, [record]);

  // Teclado en toda la página. Fuera de la partida, Espacio sobre un botón sigue siendo del botón.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const m = motor.current;
      if (!m || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!esSalto(e) && !esAbajo(e)) return;
      const otro = esDeOtro(e.target);
      if (otro === "escribiendo" || (otro === "control" && m.estado !== "jugando")) return;
      e.preventDefault();
      if (esSalto(e)) saltarRef.current();
      else m.apretarAbajo(true);
    };
    const up = (e: KeyboardEvent) => {
      const m = motor.current;
      if (!m) return;
      if (esSalto(e)) m.soltarSalto();
      if (esAbajo(e)) m.apretarAbajo(false);
    };
    // Si se va de la pestaña o de la ventana en plena partida, queda en pausa.
    const pausar = () => {
      const m = motor.current;
      if (m?.estado !== "jugando") return;
      m.pausar();
      m.apretarAbajo(false);
      setEstado("pausa");
    };
    const oculta = () => document.visibilityState === "hidden" && pausar();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", pausar);
    document.addEventListener("visibilitychange", oculta);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", pausar);
      document.removeEventListener("visibilitychange", oculta);
    };
  }, []);

  const resultado = final && textoResultado(final.resultado);

  return (
    <div
      ref={caja}
      role="application"
      aria-label="Juego del dino. Espacio o flecha arriba para saltar, flecha abajo para agacharse."
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        // Si el foco quedó en otro botón (ej: el período del ranking), Espacio sería de ese botón y no un salto.
        (document.activeElement as HTMLElement | null)?.blur?.();
        saltar();
      }}
      onPointerUp={() => motor.current?.soltarSalto()}
      onContextMenu={(e) => e.preventDefault()}
      className="relative w-full cursor-pointer touch-none select-none overflow-hidden rounded-3xl border bg-card shadow-sm focus-visible:ring-offset-0"
    >
      <canvas ref={canvas} className="block w-full" style={{ aspectRatio: `${ANCHO} / ${ALTO}` }} />

      {estado !== "jugando" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-3">
          <div className="floating max-w-[90%] rounded-2xl px-3 py-1.5 text-center duration-300 animate-in fade-in-0 zoom-in-95 sm:px-6 sm:py-3.5">
            {estado === "fin" ? (
              <>
                <p className="font-display text-xl leading-none sm:text-4xl">Game over</p>
                <p className="mt-0.5 text-xs tabular-nums sm:mt-1.5 sm:text-sm">
                  {final?.puntaje.toLocaleString("es-UY")} puntos
                  {final?.guardando && <Loader2 className="ml-1.5 inline h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </p>
                {final?.error ? (
                  <p className="mt-0.5 text-[11px] text-destructive sm:text-xs">{final.error}</p>
                ) : resultado ? (
                  <p className="mt-0.5 text-[11px] font-medium sm:text-xs">{resultado}</p>
                ) : null}
                {/* En el celular no entra: tocar para volver a jugar ya lo enseñó "Tocá para arrancar". */}
                <p className="mt-1.5 hidden text-xs text-muted-foreground sm:block">Espacio o click para volver a jugar</p>
              </>
            ) : estado === "pausa" ? (
              <>
                <p className="font-display text-2xl leading-none sm:text-3xl">En pausa</p>
                <p className="mt-1 text-xs text-muted-foreground">Espacio o click para seguir</p>
              </>
            ) : (
              <p className="text-sm font-medium">
                <span className="hidden sm:inline">Apretá espacio para arrancar</span>
                <span className="sm:hidden">Tocá para arrancar</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
