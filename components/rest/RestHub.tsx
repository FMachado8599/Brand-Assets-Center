"use client";

import Link from "next/link";
import { ArrowUpRight, Crown, Flag } from "lucide-react";
import { useRanking } from "@/hooks/useRanking";
import { CACTUS_CHICO, CACTUS_GRANDE, CELDA, DINO, NUBE } from "@/lib/rest/dino/sprites";
import { DIFICULTADES, formatPuntaje, JUEGOS, type Juego, type JuegoId } from "@/lib/rest/juegos";
import type { Modo } from "@/lib/rest/partidas";
import { cn } from "@/lib/utils";
import { Avatar } from "./Ranking";

/** Entrada escalonada de las tarjetas (con movimiento reducido, globals.css la apaga). */
const entrada = (i: number) => ({ animationDelay: `${120 + i * 80}ms` });

/** Inicio de Rest: los juegos, con quién va primero esta semana en cada uno. */
export function RestHub() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-8 md:pt-32">
      <header className="pb-8 duration-700 animate-in fade-in-0 md:pb-10">
        <p className="eyebrow">Rest</p>
        <h1 className="mt-4 text-balance font-display text-[clamp(2.6rem,7vw,5.5rem)] leading-[0.92] tracking-[-0.02em]">
          Un recreo. <em className="text-ink/40">Cinco minutos y volvés.</em>
        </h1>
        <p className="mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
          Juegos cortos para cortar un rato. Cada lunes el ranking arranca de cero, así que siempre hay revancha.
        </p>
      </header>

      <ul className="grid gap-3 md:grid-cols-2">
        {JUEGOS.map((j, i) => (
          <li key={j.id} className="duration-700 animate-in fade-in-0 slide-in-from-bottom-3 fill-mode-backwards" style={entrada(i)}>
            <TarjetaJuego juego={j} />
          </li>
        ))}
      </ul>

      <p className="mt-6 max-w-2xl text-xs text-muted-foreground">
        En el ranking cuenta la mejor partida de cada uno. La base anota cuándo empieza y cuándo termina cada partida: un
        puntaje que no da con el tiempo jugado no entra.
      </p>
    </main>
  );
}

function TarjetaJuego({ juego }: { juego: Juego }) {
  return (
    <Link
      href={juego.href}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-ink/15 bg-card shadow-[0_1px_0_hsl(240_12%_5%/0.04)] transition-shadow hover:shadow-md"
    >
      <div className="relative h-40 overflow-hidden border-b border-ink/10 bg-background/50 sm:h-44">
        {juego.id === "dino" ? <EscenaDino /> : <EscenaBuscaminas />}
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-[2.4rem] leading-none tracking-[-0.02em] sm:text-5xl">{juego.nombre}</h2>
          <ArrowUpRight className="h-6 w-6 shrink-0 transition-transform duration-500 group-hover:rotate-45" />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{juego.bajada}</p>
        <div className="mt-5 space-y-1.5 border-t pt-4">
          <p className="eyebrow mb-2">Primeros de la semana</p>
          {juego.id === "dino" ? (
            <Lider juego="dino" modo="" />
          ) : (
            DIFICULTADES.map((d) => <Lider key={d.value} juego="buscaminas" modo={d.value} etiqueta={d.label} />)
          )}
        </div>
      </div>
    </Link>
  );
}

/** Quién va primero esta semana (y tu marca, si no sos vos). */
function Lider({ juego, modo, etiqueta }: { juego: JuegoId; modo: Modo; etiqueta?: string }) {
  const { filas, estado, loading } = useRanking(juego, modo, "semana", 1);
  const primero = filas[0];
  const yo = filas.find((f) => f.yo);
  return (
    <div className="flex min-h-7 items-center gap-2.5 text-sm">
      {etiqueta && <span className="w-24 shrink-0 text-xs text-muted-foreground">{etiqueta}</span>}
      {loading ? (
        <span className="skeleton h-3 w-32 rounded-full" />
      ) : estado !== "ok" ? (
        <span className="text-xs text-muted-foreground">Sin ranking en este entorno</span>
      ) : !primero ? (
        <span className="text-xs text-muted-foreground">Nadie todavía: el puesto es tuyo</span>
      ) : (
        <>
          <Crown className="h-3.5 w-3.5 shrink-0 text-ink/40" />
          <Avatar nombre={primero.nombre} avatar={primero.avatar} size={22} />
          <span className="min-w-0 truncate font-medium">{primero.yo ? "Vos" : primero.nombre}</span>
          <span className="ml-auto shrink-0 font-semibold tabular-nums">{formatPuntaje(juego, primero.puntaje)}</span>
          {yo && yo !== primero && (
            <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
              vos {yo.puesto}º · {formatPuntaje(juego, yo.puntaje)}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** Un dibujo hecho de celdas de pixel art, en SVG (nítido a cualquier tamaño). */
function Pixeles({ filas, x, y, className }: { filas: string[]; x: number; y: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y})`} className={className}>
      {filas.flatMap((fila, r) =>
        [...fila].map((c, k) => (c === "#" ? <rect key={`${r}-${k}`} x={k * CELDA} y={r * CELDA} width={CELDA} height={CELDA} /> : null))
      )}
    </g>
  );
}

function EscenaDino() {
  return (
    <svg viewBox="0 0 300 96" className="absolute inset-x-0 bottom-2 block h-auto w-full fill-ink" shapeRendering="crispEdges" aria-hidden>
      <Pixeles filas={NUBE} x={120} y={14} className="fill-ink/15" />
      <Pixeles filas={NUBE} x={232} y={30} className="fill-ink/15" />
      <rect x={0} y={83} width={300} height={2} />
      <g className="transition-transform duration-500 ease-smooth group-hover:-translate-y-6">
        <Pixeles filas={DINO.correA} x={34} y={44} />
      </g>
      <Pixeles filas={CACTUS_CHICO} x={170} y={54} />
      <Pixeles filas={CACTUS_GRANDE} x={250} y={38} />
      <Pixeles filas={CACTUS_CHICO} x={276} y={54} />
    </svg>
  );
}

/** Un pedazo de tablero a medio despejar (con sus números bien contados): # cerrada, F bandera. */
const MUESTRA = [
  ".1F1...",
  "1221...",
  "1F1..11",
  "111..1#",
  ".....11",
];
const COLOR_NUMERO = ["", "#1d4ed8", "#15803d"];

function EscenaBuscaminas() {
  return (
    <div className="grid h-full place-items-center px-6" aria-hidden>
      <div className="grid grid-cols-7 gap-[2px] rounded-lg bg-ink/[0.12] p-[3px]">
        {MUESTRA.flatMap((fila, r) =>
          [...fila].map((c, k) => {
            const cerrada = c === "F" || c === "#";
            return (
              <span
                key={`${r}-${k}`}
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-[4px] text-xs font-bold sm:h-7 sm:w-7",
                  cerrada ? "bg-card shadow-[inset_0_-2px_0_hsl(var(--input))]" : "bg-transparent"
                )}
                style={{ color: COLOR_NUMERO[Number(c)] || undefined }}
              >
                {c === "F" ? <Flag className="h-3.5 w-3.5 fill-primary" /> : /\d/.test(c) ? c : null}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
