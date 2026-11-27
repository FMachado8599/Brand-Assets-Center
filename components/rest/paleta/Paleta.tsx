"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Play, Timer } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { useClients } from "@/hooks/useClients";
import { empezarPartida, mensaje, terminarPartida, type Resultado } from "@/lib/rest/partidas";
import { CASTIGO_MS, DURACION_MS, marcasJugables, nuevaPregunta, OPCIONES, PAUSA_MS, type Pregunta } from "@/lib/rest/paleta";
import { cn } from "@/lib/utils";
import { textoResultado } from "../Ranking";

type Estado = "listo" | "jugando" | "fin";
type Final = { puntaje: number; guardando: boolean; resultado?: Resultado; error?: string };

/**
 * Paleta, contrarreloj: 45 segundos para adivinar todas las marcas que puedas por sus colores. Un
 * punto por acierto; equivocarse cuesta 2 segundos. La partida se abre en la base al arrancar y se
 * cierra con el puntaje (lib/rest/partidas.ts), como los demás juegos.
 */
export function Paleta({ mejor, onGuardada }: { mejor: number | null; onGuardada: () => void }) {
  const { clients, loading } = useClients();
  const jugables = useMemo(() => marcasJugables(clients), [clients]);
  const [estado, setEstado] = useState<Estado>("listo");
  const [pregunta, setPregunta] = useState<Pregunta | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [puntaje, setPuntaje] = useState(0);
  const [restante, setRestante] = useState(DURACION_MS);
  const [final, setFinal] = useState<Final | null>(null);
  const fin = useRef(0);
  const partida = useRef<Promise<string | null> | null>(null);
  const recientes = useRef<string[]>([]);
  const puntos = useRef(0);

  const siguiente = useCallback(() => {
    const p = nuevaPregunta(jugables, clients, recientes.current);
    if (p) recientes.current = [p.respuesta.id, ...recientes.current].slice(0, Math.min(6, Math.max(1, jugables.length - 1)));
    setPregunta(p);
    setElegida(null);
  }, [jugables, clients]);

  const arrancar = () => {
    if (jugables.length < OPCIONES) return;
    puntos.current = 0;
    recientes.current = [];
    setPuntaje(0);
    setFinal(null);
    fin.current = performance.now() + DURACION_MS;
    setRestante(DURACION_MS);
    setEstado("jugando");
    siguiente();
    // Sin esperar: la base anota la hora de arranque y el id llega mientras se juega.
    partida.current = empezarPartida("paleta", "");
  };

  const terminar = useCallback(async () => {
    setEstado("fin");
    const valor = puntos.current;
    const abierta = partida.current;
    partida.current = null;
    setFinal({ puntaje: valor, guardando: Boolean(abierta) });
    const id = abierta ? await abierta : null;
    if (!id) return setFinal({ puntaje: valor, guardando: false });
    try {
      const resultado = await terminarPartida(id, valor);
      setFinal({ puntaje: valor, guardando: false, resultado });
      onGuardada();
    } catch (e) {
      setFinal({ puntaje: valor, guardando: false, error: mensaje(e) });
    }
  }, [onGuardada]);

  // El reloj.
  useEffect(() => {
    if (estado !== "jugando") return;
    let raf = 0;
    const tic = () => {
      const r = Math.max(0, fin.current - performance.now());
      setRestante(r);
      if (r <= 0) {
        terminar();
        return;
      }
      raf = requestAnimationFrame(tic);
    };
    raf = requestAnimationFrame(tic);
    return () => cancelAnimationFrame(raf);
  }, [estado, terminar]);

  const responder = useCallback(
    (id: string) => {
      if (estado !== "jugando" || !pregunta || elegida) return;
      setElegida(id);
      if (id === pregunta.respuesta.id) {
        puntos.current += 1;
        setPuntaje(puntos.current);
      } else {
        fin.current -= CASTIGO_MS;
      }
      setTimeout(() => {
        if (fin.current - performance.now() > 0) siguiente();
      }, PAUSA_MS);
    },
    [estado, pregunta, elegida, siguiente]
  );

  // Teclado: 1 a 4 para responder, Espacio o Enter para arrancar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (estado !== "jugando" && (e.code === "Space" || e.code === "Enter")) {
        e.preventDefault();
        arrancar();
        return;
      }
      const n = Number(e.key);
      if (estado === "jugando" && pregunta && n >= 1 && n <= pregunta.opciones.length) {
        e.preventDefault();
        responder(pregunta.opciones[n - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const segundos = Math.ceil(restante / 1000);
  const pocas = !loading && jugables.length < OPCIONES;

  return (
    <div className="overflow-hidden rounded-[1.75rem] border bg-card shadow-sm">
      {/* El reloj, como una barra que se achica. */}
      <div className="h-1.5 bg-foreground/[0.06]">
        <div
          className={cn("h-full transition-colors", segundos <= 10 ? "bg-[color:var(--tono-vencida)]" : "bg-primary")}
          style={{ width: `${(restante / DURACION_MS) * 100}%` }}
        />
      </div>
      <div className="p-5 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums">
            <Timer className="h-4 w-4" /> {segundos} s
          </span>
          <span className="text-sm">
            <span className="font-display text-3xl tabular-nums">{puntaje}</span> <span className="text-muted-foreground">{puntaje === 1 ? "acierto" : "aciertos"}</span>
          </span>
          <span className="text-sm text-muted-foreground">{mejor != null ? `Tu récord: ${mejor}` : "Sin récord todavía"}</span>
        </div>

        {loading ? (
          <div className="grid h-72 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pocas ? (
          <div className="grid min-h-[18rem] place-items-center text-center">
            <div className="max-w-md">
              <p className="font-display text-3xl">Faltan paletas</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Para jugar hacen falta al menos {OPCIONES} marcas con dos colores o más en su paleta (hoy hay {jugables.length}). Se cargan en la ficha de cada
                cliente, y el juego se arma solo.
              </p>
              <Link href="/clientes" className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-semibold text-cream dark:bg-cream dark:text-ink">
                Ir a Clientes
              </Link>
            </div>
          </div>
        ) : estado !== "jugando" || !pregunta ? (
          <div className="grid min-h-[18rem] place-items-center text-center">
            <div>
              {final ? (
                <>
                  <p className="font-display text-6xl tabular-nums">{final.puntaje}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {final.guardando ? "Guardando…" : (final.error ?? textoResultado(final.resultado) ?? (final.puntaje ? "¡Bien ahí!" : "Otra vez será."))}
                  </p>
                </>
              ) : (
                <>
                  <div className="mx-auto flex h-16 w-72 overflow-hidden rounded-2xl">
                    {["#FFD600", "#0B0B0E", "#EBE7DD", "#FF5C39", "#5B8CFF"].map((c) => (
                      <span key={c} className="flex-1" style={{ background: c }} />
                    ))}
                  </div>
                  <p className="mt-4 font-display text-3xl">¿De quién es esta paleta?</p>
                  <p className="mt-1 text-sm text-muted-foreground">{jugables.length} marcas en juego · 45 segundos</p>
                </>
              )}
              <button
                type="button"
                onClick={arrancar}
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03]"
              >
                <Play className="h-4 w-4" /> {final ? "Otra vez" : "Arrancar"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <div key={pregunta.respuesta.id + puntaje} className="flex h-40 overflow-hidden rounded-2xl ring-1 ring-inset ring-foreground/10 duration-200 animate-in fade-in-0 zoom-in-95 sm:h-48">
              {pregunta.colores.map((c) => (
                <span key={c} className="flex flex-1 items-end p-2" style={{ background: c }}>
                  {elegida && <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-white">{c}</span>}
                </span>
              ))}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {pregunta.opciones.map((o, i) => {
                const bien = o.id === pregunta.respuesta.id;
                const mostrar = elegida != null;
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={mostrar}
                    onClick={() => responder(o.id)}
                    className={cn(
                      "flex h-14 items-center gap-3 rounded-2xl border px-3 text-left font-medium transition-colors",
                      !mostrar && "hover:border-foreground/30 hover:bg-foreground/[0.03]",
                      mostrar && bien && "border-transparent bg-[color:var(--tono-finalizada)] text-white",
                      mostrar && !bien && elegida === o.id && "border-transparent bg-[color:var(--tono-vencida)] text-white",
                      mostrar && !bien && elegida !== o.id && "opacity-40"
                    )}
                  >
                    <kbd className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-current/20 text-xs opacity-60">{i + 1}</kbd>
                    {mostrar && bien && <ClientMark brand={o} className="h-8 w-8 rounded-lg text-[9px]" pad="p-[14%]" />}
                    <span className="truncate">{o.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
