"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { Apple, Loader2, Trophy } from "lucide-react";
import { useStoredState } from "@/hooks/useStoredState";
import { empezarPartida, mensaje, terminarPartida, type Resultado } from "@/lib/rest/partidas";
import { dirDeDesliz, dirDeTecla, esDeOtro, OPUESTA, type Dir } from "@/lib/rest/teclado";
import { avanzar, celda, COLS, FILAS, intervalo, nuevaVibora, type Vibora } from "@/lib/rest/viborita";
import { textoResultado } from "../Ranking";
import { CuerpoVibora, Fruta } from "./Dibujo";

type Estado = "listo" | "jugando" | "pausa" | "fin";

/** Cómo terminó la última partida: las frutas y qué dijo la base al guardarlas. */
type Final = { frutas: number; llena: boolean; guardando: boolean; resultado?: Resultado; error?: string };

/** Pausa para que una tecla apurada no arranque otra partida apenas se choca. */
const ESPERA_REINICIO_MS = 600;
/** Doblar dos veces seguidas (arriba y enseguida izquierda) entre paso y paso cuenta: se guardan hasta 3 giros. */
const GIROS_EN_COLA = 3;

const plural = (n: number) => `${n.toLocaleString("es-UY")} ${n === 1 ? "fruta" : "frutas"}`;

export function Viborita({ mejor, onGuardada }: { mejor: number | null; onGuardada: () => void }) {
  const juego = useRef<Vibora>(nuevaVibora());
  const [vibora, setVibora] = useState(juego.current);
  const [estado, setEstadoVisible] = useState<Estado>("listo");
  const estadoRef = useRef<Estado>("listo");
  const setEstado = (e: Estado) => {
    estadoRef.current = e;
    setEstadoVisible(e);
  };
  const giros = useRef<Dir[]>([]);
  const partida = useRef<Promise<string | null> | null>(null);
  const finEn = useRef(0);
  const toque = useRef<{ x: number; y: number; deslizo: boolean } | null>(null);
  const [final, setFinal] = useState<Final | null>(null);
  const [mejorLocal, setMejorLocal] = useStoredState("rest:viborita:mejor", 0);
  const record = Math.max(mejor ?? 0, mejorLocal, vibora.frutas);
  const cuadros = `cuadros-${useId().replace(/:/g, "")}`;

  /* ───────────── Partida ───────────── */

  const arrancar = () => {
    if (estadoRef.current === "fin") {
      if (performance.now() - finEn.current < ESPERA_REINICIO_MS) return;
      juego.current = nuevaVibora();
      setVibora(juego.current);
      setFinal(null);
    }
    giros.current = [];
    setEstado("jugando");
    // Sin esperar: la base anota la hora de arranque y el id llega mientras se juega.
    partida.current = empezarPartida("viborita", "");
  };

  const doblar = (d: Dir) => {
    const cola = giros.current;
    const ultima = cola[cola.length - 1] ?? juego.current.dir;
    if (d === ultima || d === OPUESTA[ultima] || cola.length >= GIROS_EN_COLA) return;
    cola.push(d);
  };

  /** Una flecha (o deslizar el dedo): arranca, sigue después de la pausa y dobla. Después de chocar no hace nada. */
  const flecha = (d: Dir) => {
    const e = estadoRef.current;
    if (e === "fin") return;
    if (e === "listo") arrancar();
    if (e === "pausa") setEstado("jugando");
    doblar(d);
  };

  /** Espacio, Enter o un toque: arranca, vuelve a jugar o sigue. Espacio en plena partida pone pausa. */
  const principal = (pausa: boolean) => {
    const e = estadoRef.current;
    if (e === "listo" || e === "fin") arrancar();
    else if (e === "pausa") setEstado("jugando");
    else if (pausa) setEstado("pausa");
  };

  /** Lo que pasa al chocar. En un ref: lo llama el bucle de animación. */
  const alTerminar = useRef<() => void>(() => {});
  alTerminar.current = async () => {
    const v = juego.current;
    finEn.current = performance.now();
    setEstado("fin");
    if (v.frutas > mejorLocal) setMejorLocal(v.frutas);
    const abierta = partida.current;
    partida.current = null;
    const base = { frutas: v.frutas, llena: v.fin === "llena" };
    setFinal({ ...base, guardando: !!abierta });
    const id = abierta ? await abierta : null;
    if (!id) return setFinal({ ...base, guardando: false });
    try {
      const resultado = await terminarPartida(id, v.frutas);
      setFinal({ ...base, guardando: false, resultado });
      onGuardada();
    } catch (e) {
      setFinal({ ...base, guardando: false, error: mensaje(e) });
    }
  };

  // El bucle: un paso cada intervalo() por el tiempo que pasó de verdad (igual en 60 Hz que en 144 Hz).
  useEffect(() => {
    if (estado !== "jugando") return;
    let raf = 0;
    let antes = performance.now();
    let acumulado = 0;
    const cuadro = (ahora: number) => {
      acumulado += Math.min(ahora - antes, 250);
      antes = ahora;
      const inicial = juego.current;
      let v = inicial;
      while (!v.fin && acumulado >= intervalo(v.frutas)) {
        acumulado -= intervalo(v.frutas);
        v = avanzar(v, giros.current.shift() ?? v.dir);
      }
      if (v !== inicial) {
        juego.current = v;
        setVibora(v);
        if (v.fin) {
          alTerminar.current();
          return;
        }
      }
      raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(raf);
  }, [estado]);

  /* ───────────── Teclado ───────────── */

  const tecla = useRef<(e: KeyboardEvent) => void>(() => {});
  tecla.current = (e) => {
    const d = dirDeTecla(e);
    const accion = !e.metaKey && !e.ctrlKey && !e.altKey && (e.code === "Space" || e.code === "Enter");
    if (!d && !accion) return;
    const otro = esDeOtro(e.target);
    // Las flechas sobre un botón solo moverían la página; Espacio y Enter, fuera de la partida, son del botón.
    if (otro === "escribiendo" || (accion && otro === "control" && estadoRef.current !== "jugando")) return;
    e.preventDefault();
    if (d) flecha(d);
    else if (!e.repeat) principal(e.code === "Space");
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => tecla.current(e);
    // Si se va de la pestaña o de la ventana en plena partida, queda en pausa.
    const pausar = () => {
      if (estadoRef.current !== "jugando") return;
      estadoRef.current = "pausa";
      setEstadoVisible("pausa");
    };
    const oculta = () => document.visibilityState === "hidden" && pausar();
    window.addEventListener("keydown", down);
    window.addEventListener("blur", pausar);
    document.addEventListener("visibilitychange", oculta);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("blur", pausar);
      document.removeEventListener("visibilitychange", oculta);
    };
  }, []);

  /* ───────────── Dedo y mouse ───────────── */

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    // Si el foco quedó en un botón (ej: el período del ranking), Espacio sería de ese botón.
    (document.activeElement as HTMLElement | null)?.blur?.();
    toque.current = { x: e.clientX, y: e.clientY, deslizo: false };
  };
  // Cada tramo deslizado es un giro: se puede doblar dos veces sin levantar el dedo.
  const onPointerMove = (e: PointerEvent) => {
    const t = toque.current;
    if (!t) return;
    const d = dirDeDesliz(e.clientX - t.x, e.clientY - t.y);
    if (!d) return;
    flecha(d);
    toque.current = { x: e.clientX, y: e.clientY, deslizo: true };
  };
  const onPointerUp = () => {
    const t = toque.current;
    toque.current = null;
    if (t && !t.deslizo) principal(false);
  };

  /* ───────────── Dibujo ───────────── */

  const resultado = final && textoResultado(final.resultado);

  return (
    <div className="rounded-3xl border bg-card px-2 py-3 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3 px-1 text-sm sm:px-0">
        <span className="flex items-center gap-1.5 font-medium tabular-nums" aria-label={plural(vibora.frutas)}>
          <Apple className="h-4 w-4" />
          {vibora.frutas.toLocaleString("es-UY")}
        </span>
        <span className="flex items-center gap-1.5 tabular-nums text-muted-foreground" aria-label={`Tu récord: ${plural(record)}`}>
          <Trophy className="h-4 w-4" />
          {record.toLocaleString("es-UY")}
        </span>
      </div>

      <div
        role="application"
        aria-label="Viborita. Flechas o WASD para doblar, Espacio para pausar."
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (toque.current = null)}
        onContextMenu={(e) => e.preventDefault()}
        className="relative cursor-pointer touch-none select-none rounded-xl bg-foreground/[0.12] p-[3px] focus-visible:ring-offset-0"
      >
        <svg viewBox={`0 0 ${COLS} ${FILAS}`} className="block w-full rounded-[9px] bg-card" aria-hidden>
          <defs>
            <pattern id={cuadros} width={2} height={2} patternUnits="userSpaceOnUse">
              <rect width={1} height={1} className="fill-foreground/[0.035]" />
              <rect x={1} y={1} width={1} height={1} className="fill-foreground/[0.035]" />
            </pattern>
          </defs>
          <rect width={COLS} height={FILAS} fill={`url(#${cuadros})`} />
          {vibora.fruta !== null && <Fruta key={vibora.fruta} {...celda(vibora.fruta)} />}
          <CuerpoVibora celdas={vibora.cuerpo.map(celda)} dir={vibora.dir} chocada={vibora.fin === "choque"} />
        </svg>

        {estado !== "jugando" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-3" aria-live="polite">
            <div className="floating max-w-[90%] rounded-2xl px-4 py-2 text-center duration-300 animate-in fade-in-0 zoom-in-95 sm:px-6 sm:py-3.5">
              {estado === "fin" ? (
                <>
                  <p className="font-display text-2xl leading-none sm:text-4xl">
                    {final?.llena ? "¡Llenaste el tablero!" : "Te chocaste"}
                  </p>
                  <p className="mt-1 text-xs tabular-nums sm:mt-1.5 sm:text-sm">
                    {plural(final?.frutas ?? 0)}
                    {final?.guardando && <Loader2 className="ml-1.5 inline h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </p>
                  {final?.error ? (
                    <p className="mt-0.5 text-[11px] text-destructive sm:text-xs">{final.error}</p>
                  ) : resultado ? (
                    <p className="mt-0.5 text-[11px] font-medium sm:text-xs">{resultado}</p>
                  ) : null}
                  <p className="mt-1.5 text-[11px] text-muted-foreground sm:text-xs">
                    <span className="hidden sm:inline">Espacio o click para volver a jugar</span>
                    <span className="sm:hidden">Tocá para volver a jugar</span>
                  </p>
                </>
              ) : estado === "pausa" ? (
                <>
                  <p className="font-display text-2xl leading-none sm:text-3xl">En pausa</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="hidden sm:inline">Espacio, una flecha o click para seguir</span>
                    <span className="sm:hidden">Tocá o deslizá para seguir</span>
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium">
                  <span className="hidden sm:inline">Apretá una flecha para arrancar</span>
                  <span className="sm:hidden">Deslizá o tocá para arrancar</span>
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
