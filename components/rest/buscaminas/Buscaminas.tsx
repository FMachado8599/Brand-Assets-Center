"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Bomb, Flag, FlagOff, Loader2, Timer } from "lucide-react";
import { abrir, acorde, alternarBandera, nuevoTablero, type Tablero } from "@/lib/rest/buscaminas";
import { dificultad, formatTiempo, type Dificultad } from "@/lib/rest/juegos";
import { empezarPartida, mensaje, terminarPartida, type Resultado } from "@/lib/rest/partidas";
import { cn } from "@/lib/utils";
import { textoResultado } from "../Ranking";

/** Los colores de siempre para cada número, un poco más sobrios para el papel crema. */
const COLORES = ["", "#1d4ed8", "#15803d", "#b91c1c", "#312e81", "#7c2d12", "#0f766e", "#0b0b0e", "#6b7280"];

/** Mantener apretado en el celular pone la bandera. */
const LARGO_MS = 350;
const MIN_CELDA = 18;
const MAX_CELDA = 38;
/** El borde del tablero (padding), a cada lado. */
const BORDE = 3;

type Final = { ms: number; guardando: boolean; resultado?: Resultado; error?: string };

/**
 * El tablero se dibuja acostado o parado según lo que entre: el experto (30 × 16) en un celular
 * va de 16 de ancho. Es el mismo tablero, así que cuenta igual para el ranking.
 */
function useMedidas(cols: number, rows: number) {
  const caja = useRef<HTMLDivElement>(null);
  const [medidas, setMedidas] = useState({ girado: false, celda: 30, junta: 2 });
  useLayoutEffect(() => {
    const el = caja.current!;
    const medir = () => {
      const ancho = el.clientWidth - BORDE * 2;
      const girado = cols > rows && ancho / cols < 24;
      const enFila = girado ? rows : cols;
      const tamaño = (junta: number) => Math.floor((ancho - (enFila - 1) * junta) / enFila);
      // Con celdas chicas la junta entre ellas pasa a 1 px: así el experto entra en un celular.
      const junta = tamaño(2) < 26 ? 1 : 2;
      setMedidas({ girado, junta, celda: Math.max(MIN_CELDA, Math.min(MAX_CELDA, tamaño(junta))) });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols, rows]);
  return { caja, ...medidas };
}

export function Buscaminas({ nivel, onGuardada }: { nivel: Dificultad; onGuardada: () => void }) {
  const config = dificultad(nivel);
  const [tablero, setTablero] = useState<Tablero>(() => nuevoTablero(config.cols, config.rows, config.minas));
  const [foco, setFoco] = useState(0);
  const [ahora, setAhora] = useState(0);
  const [final, setFinal] = useState<Final | null>(null);
  const inicio = useRef<number | null>(null);
  const partida = useRef<Promise<string | null> | null>(null);
  const largo = useRef<{ timer: number; i: number; x: number; y: number; hecho: boolean } | null>(null);
  const celdas = useRef<(HTMLButtonElement | null)[]>([]);
  const { caja, girado, celda, junta } = useMedidas(config.cols, config.rows);

  const { estado } = tablero;
  const terminado = estado === "ganada" || estado === "perdida";

  // El reloj corre desde el primer click hasta que se gana o se pierde.
  useEffect(() => {
    if (estado !== "jugando") return;
    const id = window.setInterval(() => setAhora(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [estado]);

  const jugar = (siguiente: Tablero) => {
    if (siguiente === tablero) return;
    if (tablero.estado === "listo" && siguiente.estado !== "listo") {
      inicio.current = performance.now();
      setAhora(inicio.current);
      partida.current = empezarPartida("buscaminas", nivel);
    }
    setTablero(siguiente);
    if (siguiente.estado === "ganada") ganar(performance.now() - (inicio.current ?? performance.now()));
    if (siguiente.estado === "perdida") setAhora(performance.now());
  };

  const ganar = async (ms: number) => {
    const total = Math.round(ms);
    setAhora(performance.now());
    const abierta = partida.current;
    partida.current = null;
    setFinal({ ms: total, guardando: !!abierta });
    const id = abierta ? await abierta : null;
    if (!id) return setFinal({ ms: total, guardando: false });
    try {
      const resultado = await terminarPartida(id, total);
      setFinal({ ms: total, guardando: false, resultado });
      onGuardada();
    } catch (e) {
      setFinal({ ms: total, guardando: false, error: mensaje(e) });
    }
  };

  /** Click (o Enter) en una celda: abre la cerrada, o despeja alrededor del número. */
  const tocar = (i: number) => {
    const c = tablero.celdas[i];
    jugar(c.abierta ? acorde(tablero, i) : abrir(tablero, i));
  };
  const marcar = (i: number) => jugar(alternarBandera(tablero, i));

  /* ───────────── Mouse y dedo ───────────── */

  const onPointerDown = (e: PointerEvent, i: number) => {
    if (e.pointerType !== "touch") return;
    const timer = window.setTimeout(() => {
      if (!largo.current) return;
      largo.current.hecho = true;
      navigator.vibrate?.(15);
      marcar(i);
    }, LARGO_MS);
    largo.current = { timer, i, x: e.clientX, y: e.clientY, hecho: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const l = largo.current;
    if (l && Math.hypot(e.clientX - l.x, e.clientY - l.y) > 10) {
      window.clearTimeout(l.timer);
      largo.current = null;
    }
  };
  const onPointerUp = (e: PointerEvent, i: number) => {
    if (e.pointerType === "touch") {
      const l = largo.current;
      largo.current = null;
      if (!l || l.i !== i) return;
      window.clearTimeout(l.timer);
      if (!l.hecho) tocar(i);
      return;
    }
    if (e.button === 0) tocar(i);
    if (e.button === 1) jugar(acorde(tablero, i));
  };

  /* ───────────── Teclado ───────────── */

  // Las flechas se mueven por como se ve el tablero (acostado o parado).
  const verCols = girado ? config.rows : config.cols;
  const verRows = girado ? config.cols : config.rows;
  const indice = (vr: number, vc: number) => (girado ? vc * config.cols + vr : vr * config.cols + vc);
  const posicion = (i: number) => {
    const r = Math.floor(i / config.cols);
    const c = i % config.cols;
    return girado ? { vr: c, vc: r } : { vr: r, vc: c };
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const { vr, vc } = posicion(i);
    const mover: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (mover[e.key]) {
      e.preventDefault();
      const [dr, dc] = mover[e.key];
      const nr = Math.max(0, Math.min(verRows - 1, vr + dr));
      const nc = Math.max(0, Math.min(verCols - 1, vc + dc));
      const destino = indice(nr, nc);
      setFoco(destino);
      celdas.current[destino]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      tocar(i);
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      marcar(i);
    }
  };

  /* ───────────── Dibujo ───────────── */

  const segundos = inicio.current === null ? 0 : (final ? final.ms : ahora - inicio.current) / 1000;
  const restantes = config.minas - tablero.banderas;
  const resultado = final && textoResultado(final.resultado);

  const orden = Array.from({ length: verRows * verCols }, (_, k) => indice(Math.floor(k / verCols), k % verCols));

  return (
    <div className="rounded-3xl border bg-card px-2 py-3 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3 px-1 text-sm sm:px-0">
        <span className="flex items-center gap-1.5 tabular-nums" aria-label={`${restantes} minas sin marcar`}>
          <Flag className="h-4 w-4 fill-primary" />
          {restantes}
        </span>
        <p className="min-w-0 truncate text-center font-medium" aria-live="polite">
          {estado === "ganada" ? (
            <>
              ¡Despejado en {formatTiempo(final?.ms ?? 0)}!
              {final?.guardando && <Loader2 className="ml-1.5 inline h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </>
          ) : estado === "perdida" ? (
            "Boom. Pisaste una mina."
          ) : estado === "listo" ? (
            <span className="text-muted-foreground">El primer click nunca explota</span>
          ) : null}
        </p>
        <span className="flex items-center gap-1.5 tabular-nums" aria-label="Tiempo">
          <Timer className="h-4 w-4" />
          {segundos.toFixed(1).replace(".", ",")}
        </span>
      </div>

      <div ref={caja} className="overflow-x-auto">
        <div
          role="grid"
          aria-label={`Buscaminas ${config.label.toLowerCase()}: ${config.cols} × ${config.rows}, ${config.minas} minas`}
          className="mx-auto grid w-max rounded-xl bg-ink/[0.12]"
          style={{ gridTemplateColumns: `repeat(${verCols}, ${celda}px)`, gap: junta, padding: BORDE }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {orden.map((i) => {
            const c = tablero.celdas[i];
            const exploto = tablero.exploto === i;
            const minaVista = estado === "perdida" && c.mina && !c.bandera;
            const banderaMal = estado === "perdida" && c.bandera && !c.mina;
            const abierta = c.abierta || minaVista;
            const { vr, vc } = posicion(i);
            return (
              <button
                key={i}
                ref={(el) => {
                  celdas.current[i] = el;
                }}
                type="button"
                role="gridcell"
                tabIndex={i === foco ? 0 : -1}
                aria-label={`Fila ${vr + 1}, columna ${vc + 1}: ${
                  c.bandera ? "bandera" : !c.abierta ? "sin abrir" : c.vecinas ? `${c.vecinas} alrededor` : "vacía"
                }`}
                onFocus={() => setFoco(i)}
                onPointerDown={(e) => onPointerDown(e, i)}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => onPointerUp(e, i)}
                onPointerCancel={() => {
                  if (largo.current) window.clearTimeout(largo.current.timer);
                  largo.current = null;
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  // En el celular la bandera la pone el toque largo, no el menú.
                  if (largo.current || (e.nativeEvent as globalThis.PointerEvent).pointerType === "touch") return;
                  marcar(i);
                }}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={cn(
                  "grid touch-manipulation select-none place-items-center rounded-[5px] font-bold leading-none tabular-nums transition-colors focus-visible:z-10 focus-visible:ring-offset-0",
                  // Cerrada: papel en relieve. Abierta: hundida, se ve el fondo del tablero.
                  abierta
                    ? "bg-transparent"
                    : "bg-card shadow-[inset_0_-2px_0_hsl(var(--input))] hover:bg-white active:bg-transparent active:shadow-none",
                  exploto && "bg-destructive text-destructive-foreground",
                  terminado && "cursor-default"
                )}
                style={{
                  width: celda,
                  height: celda,
                  fontSize: Math.round(celda * 0.5),
                  color: c.abierta && !c.mina ? COLORES[c.vecinas] : undefined,
                }}
              >
                {banderaMal ? (
                  <FlagOff className="h-[55%] w-[55%] text-destructive" />
                ) : c.bandera ? (
                  <Flag className="h-[55%] w-[55%] fill-primary" />
                ) : minaVista ? (
                  <Bomb className="h-[60%] w-[60%]" />
                ) : c.abierta && c.vecinas ? (
                  c.vecinas
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {terminado && (
        <p className="mt-3 text-center text-xs text-muted-foreground" aria-live="polite">
          {final?.error ? (
            <span className="text-destructive">{final.error}</span>
          ) : resultado ? (
            <span className="font-medium text-foreground">{resultado}</span>
          ) : estado === "perdida" ? (
            "Las minas que faltaban quedaron a la vista."
          ) : null}{" "}
          Para otra, «Nueva partida» en la barra de arriba.
        </p>
      )}
    </div>
  );
}
