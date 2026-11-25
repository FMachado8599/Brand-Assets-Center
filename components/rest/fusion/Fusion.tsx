"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoredState } from "@/hooks/useStoredState";
import { arrancar, maxima, mover, PAUSA_MS, tableroVacio, type Tablero } from "@/lib/rest/fusion";
import { empezarPartida, mensaje, terminarPartida, type Resultado } from "@/lib/rest/partidas";
import { dirDeDesliz, dirDeTecla, esDeOtro, type Dir } from "@/lib/rest/teclado";
import { textoResultado } from "../Ranking";
import { FichaVista } from "./Ficha";

/** Cómo terminó la partida: el puntaje y qué dijo la base al guardarlo. */
type Final = { puntaje: number; guardando: boolean; resultado?: Resultado; error?: string };

const puntos = (n: number) => `${n.toLocaleString("es-UY")} ${n === 1 ? "punto" : "puntos"}`;

/**
 * El tablero de Fusión. La partida se abre en la base con la primera jugada y se guarda cuando no
 * quedan jugadas, o cuando se deja a medias (Nueva partida, otro juego): lo que se sumó, cuenta.
 */
export function Fusion({ mejor, onGuardada, onOtra }: { mejor: number | null; onGuardada: () => void; onOtra: () => void }) {
  const [tablero, setTablero] = useState<Tablero>(tableroVacio);
  const actual = useRef(tablero);
  const partida = useRef<Promise<string | null> | null>(null);
  const ultimaJugada = useRef(0);
  const pendiente = useRef<{ dir: Dir; timer: number } | null>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);
  /** El aviso de 2048 frena las jugadas hasta que se elige seguir. */
  const [aviso, setAviso] = useState(false);
  const avisoRef = useRef(false);
  const [final, setFinal] = useState<Final | null>(null);
  /** El "+N" que flota al lado del puntaje (k cambia en cada jugada que suma: vuelve a animarse). */
  const [suma, setSuma] = useState<{ n: number; k: number } | null>(null);
  const [mejorLocal, setMejorLocal] = useStoredState("rest:fusion:mejor", 0);
  const record = Math.max(mejor ?? 0, mejorLocal, tablero.puntaje);
  const onGuardadaRef = useRef(onGuardada);
  onGuardadaRef.current = onGuardada;

  const poner = (t: Tablero) => {
    actual.current = t;
    setTablero(t);
  };

  // Las dos primeras fichas salen al azar: recién en el navegador, para no romper la hidratación.
  useEffect(() => poner(arrancar()), []);

  const terminar = async (puntaje: number) => {
    if (puntaje > mejorLocal) setMejorLocal(puntaje);
    const abierta = partida.current;
    partida.current = null;
    setFinal({ puntaje, guardando: !!abierta });
    const id = abierta ? await abierta : null;
    if (!id) return setFinal({ puntaje, guardando: false });
    try {
      const resultado = await terminarPartida(id, puntaje);
      setFinal({ puntaje, guardando: false, resultado });
      onGuardadaRef.current();
    } catch (e) {
      setFinal({ puntaje, guardando: false, error: mensaje(e) });
    }
  };

  const jugar = (dir: Dir) => {
    const antes = actual.current;
    if (antes.fin || avisoRef.current || !antes.fichas.length) return;
    // Muy seguido: se juega la última pedida apenas termina el deslizamiento (ver PAUSA_MS).
    const falta = PAUSA_MS - (performance.now() - ultimaJugada.current);
    if (falta > 0) {
      if (pendiente.current) pendiente.current.dir = dir;
      else {
        const timer = window.setTimeout(() => {
          const p = pendiente.current;
          pendiente.current = null;
          if (p) jugarRef.current(p.dir);
        }, falta);
        pendiente.current = { dir, timer };
      }
      return;
    }
    const despues = mover(antes, dir);
    if (despues === antes) return;
    ultimaJugada.current = performance.now();
    // Sin esperar: la base anota la hora de arranque y el id llega mientras se juega.
    partida.current ??= empezarPartida("fusion", "");
    poner(despues);
    const sumo = despues.puntaje - antes.puntaje;
    if (sumo) setSuma((s) => ({ n: sumo, k: (s?.k ?? 0) + 1 }));
    if (despues.llego && !antes.llego) {
      avisoRef.current = true;
      setAviso(true);
    }
    if (despues.fin) terminar(despues.puntaje);
  };
  const jugarRef = useRef(jugar);
  jugarRef.current = jugar;

  // Al irse con la partida a medias (Nueva partida, otro juego), se guarda lo que se sumó.
  const alSalir = useRef(() => {});
  alSalir.current = () => {
    if (pendiente.current) window.clearTimeout(pendiente.current.timer);
    pendiente.current = null;
    const abierta = partida.current;
    const t = actual.current;
    partida.current = null;
    if (!abierta || t.fin || t.puntaje <= 0) return;
    if (t.puntaje > mejorLocal) setMejorLocal(t.puntaje);
    abierta
      .then((id) => (id ? terminarPartida(id, t.puntaje) : null))
      .then((r) => r && onGuardadaRef.current())
      .catch(() => {});
  };
  useEffect(() => () => alSalir.current(), []);

  // Teclado en toda la página (menos mientras se escribe).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const d = dirDeTecla(e);
      if (!d || esDeOtro(e.target) === "escribiendo") return;
      e.preventDefault();
      if (!e.repeat) jugarRef.current(d);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  // Un deslizamiento, una jugada: se juega apenas el dedo recorre lo suficiente.
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    toque.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: PointerEvent) => {
    const t = toque.current;
    if (!t) return;
    const d = dirDeDesliz(e.clientX - t.x, e.clientY - t.y);
    if (!d) return;
    toque.current = null;
    jugar(d);
  };

  const seguir = () => {
    avisoRef.current = false;
    setAviso(false);
  };

  const resultado = final && textoResultado(final.resultado);

  return (
    <div className="rounded-3xl border bg-card px-3 py-4 shadow-sm sm:p-6">
      <div className="mx-auto max-w-[30rem]">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Puntos</p>
            <p className="mt-1 font-display text-4xl leading-none tabular-nums">
              <span className="relative">
                {tablero.puntaje.toLocaleString("es-UY")}
                {suma && (
                  <span
                    key={suma.k}
                    aria-hidden
                    className="absolute bottom-1 left-full ml-2 whitespace-nowrap font-ui text-sm font-semibold text-muted-foreground duration-700 animate-out fade-out-0 slide-out-to-top-3 fill-mode-forwards"
                  >
                    +{suma.n.toLocaleString("es-UY")}
                  </span>
                )}
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="eyebrow">Récord</p>
            <p className="mt-1 font-display text-4xl leading-none tabular-nums text-muted-foreground">{record.toLocaleString("es-UY")}</p>
          </div>
        </div>

        <div
          role="application"
          aria-label={`Fusión, ${puntos(tablero.puntaje)}. Flechas o WASD para deslizar las fichas.`}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (toque.current = null)}
          onPointerCancel={() => (toque.current = null)}
          className="relative aspect-square touch-none select-none rounded-2xl bg-foreground/[0.12] p-[var(--g)] [--g:6px] focus-visible:ring-offset-0 sm:[--g:10px]"
          style={{ containerType: "inline-size" }}
        >
          <div className="grid h-full grid-cols-4 grid-rows-4 gap-[var(--g)]" aria-hidden>
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} className="rounded-[10px] bg-foreground/[0.05] dark:bg-background sm:rounded-xl" />
            ))}
          </div>
          <div className="absolute inset-[var(--g)]" aria-hidden>
            {tablero.fichas.map((f) => (
              <FichaVista key={f.id} ficha={f} />
            ))}
          </div>

          {(aviso || tablero.fin) && (
            <div
              className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-card/40 p-4 delay-300 duration-500 animate-in fade-in-0 fill-mode-backwards"
              aria-live="polite"
            >
              <div className="floating max-w-[92%] rounded-2xl px-5 py-4 text-center sm:px-7 sm:py-5">
                {tablero.fin ? (
                  <>
                    <p className="font-display text-3xl leading-none sm:text-4xl">No quedan jugadas</p>
                    <p className="mt-1.5 text-sm tabular-nums">
                      {puntos(tablero.puntaje)} · llegaste a {maxima(tablero).toLocaleString("es-UY")}
                      {final?.guardando && <Loader2 className="ml-1.5 inline h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </p>
                    {final?.error ? (
                      <p className="mt-1 text-xs text-destructive">{final.error}</p>
                    ) : resultado ? (
                      <p className="mt-1 text-xs font-medium">{resultado}</p>
                    ) : null}
                    <Button size="sm" className="mt-3 rounded-full px-4" onClick={onOtra}>
                      Jugar otra
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="font-display text-3xl leading-none sm:text-4xl">¡Llegaste a 2048!</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">Podés seguir: cada fusión sigue sumando.</p>
                    <Button size="sm" className="mt-3 rounded-full px-4" onClick={seguir} autoFocus>
                      Seguir jugando
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
