"use client";

import { useState } from "react";
import { Crown, DatabaseZap, Trophy, UserRound } from "lucide-react";
import { formatPuntaje, type JuegoId, type Periodo } from "@/lib/rest/juegos";
import { LIMITE_RANKING, type EstadoRanking, type FilaRanking, type Resultado } from "@/lib/rest/partidas";
import { cn } from "@/lib/utils";

/** "¡Tu mejor marca! Vas 2º esta semana." — lo que se cuenta al guardar una partida. */
export function textoResultado(r: Resultado | undefined) {
  if (!r) return null;
  const puesto = r.puestoSemana ? `${r.record ? "Vas" : "Esta semana vas"} ${r.puestoSemana}º` : null;
  if (r.record) return puesto ? `¡Tu mejor marca! ${puesto} esta semana.` : "¡Tu mejor marca!";
  return puesto ? `${puesto}.` : null;
}

export function Avatar({ nombre, avatar, size = 28 }: { nombre: string; avatar: string | null; size?: number }) {
  const [roto, setRoto] = useState(false);
  if (avatar && !roto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatar}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setRoto(true)}
        className="shrink-0 rounded-full object-cover ring-1 ring-ink/15"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-ink/10 text-[11px] font-semibold text-ink/60"
      style={{ width: size, height: size }}
    >
      {nombre.trim()[0]?.toUpperCase() ?? <UserRound className="h-3 w-3" />}
    </span>
  );
}

/** El puesto: el primero con corona, el podio en amarillo y negro. */
function Puesto({ n }: { n: number }) {
  return (
    <span
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums",
        n === 1 ? "bg-primary text-primary-foreground" : n <= 3 ? "bg-ink text-cream" : "text-muted-foreground"
      )}
    >
      {n === 1 ? <Crown className="h-3.5 w-3.5" /> : n}
    </span>
  );
}

const AVISOS: Record<Exclude<EstadoRanking, "ok">, string> = {
  "sin-base": "En este entorno no hay base: se juega igual, pero el ranking no se guarda.",
  "sin-migracion": "Para el ranking falta un paso en la base: correr supabase/migracion-juegos.sql en Supabase → SQL Editor.",
  error: "No se pudo leer el ranking. Probá de nuevo en un rato.",
};

export function Ranking({
  juego,
  filas,
  estado,
  loading,
  periodo,
  onPeriodo,
  titulo,
}: {
  juego: JuegoId;
  filas: FilaRanking[];
  estado: EstadoRanking;
  loading: boolean;
  periodo: Periodo;
  onPeriodo: (p: Periodo) => void;
  /** Lo que se rankea, si hay más de un tablero por juego (ej: la dificultad). */
  titulo?: string;
}) {
  const yo = filas.find((f) => f.yo);
  // Si estás fuera de los primeros, tu fila llega de más, al final: se muestra separada.
  const afuera = !!yo && filas.length > LIMITE_RANKING && filas[filas.length - 1] === yo;
  const lista = afuera ? filas.slice(0, -1) : filas;
  const jugadas = juego === "buscaminas" ? ["ganada", "ganadas"] : ["partida", "partidas"];

  return (
    <section aria-labelledby="ranking-titulo" className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Ranking{titulo ? ` · ${titulo}` : ""}</p>
          <h2 id="ranking-titulo" className="mt-1 font-display text-3xl leading-none">
            {periodo === "semana" ? "Esta semana" : "De siempre"}
          </h2>
        </div>
        <Trophy className="mt-1 h-5 w-5 text-ink/30" />
      </div>

      <div role="tablist" aria-label="Período" className="mt-4 inline-flex rounded-full bg-secondary p-0.5">
        {(
          [
            ["semana", "Esta semana"],
            ["siempre", "De siempre"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={periodo === value}
            onClick={() => onPeriodo(value)}
            className={cn(
              "h-7 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
              periodo === value && "bg-card text-foreground shadow-sm"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {estado !== "ok" ? (
        <p className="mt-4 flex items-start gap-2.5 rounded-2xl bg-primary/25 px-3.5 py-3 text-sm">
          <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{AVISOS[estado]}</span>
        </p>
      ) : loading ? (
        <ul className="mt-4 space-y-2" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-2 py-1">
              <span className="skeleton h-7 w-7 rounded-full" />
              <span className="skeleton h-3 flex-1 rounded-full" />
              <span className="skeleton h-3 w-12 rounded-full" />
            </li>
          ))}
        </ul>
      ) : !filas.length ? (
        <p className="mt-6 pb-2 text-center text-sm text-muted-foreground">
          {periodo === "semana" ? "Nadie jugó todavía esta semana." : "Todavía no jugó nadie."} ¿Arrancás vos?
        </p>
      ) : (
        <ol className="mt-3 space-y-0.5">
          {lista.map((f) => (
            <Fila key={`${f.puesto}-${f.nombre}-${f.logrado}`} fila={f} juego={juego} jugadas={jugadas} />
          ))}
          {afuera && yo && (
            <>
              <li aria-hidden className="px-2 text-center text-xs leading-3 text-muted-foreground">
                ⋯
              </li>
              <Fila fila={yo} juego={juego} jugadas={jugadas} />
            </>
          )}
        </ol>
      )}

      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
        Cuenta la mejor de cada uno. {periodo === "semana" ? "Cada lunes arranca de cero: siempre hay revancha." : "Desde que existe Rest."}
      </p>
    </section>
  );
}

function Fila({ fila, juego, jugadas }: { fila: FilaRanking; juego: JuegoId; jugadas: string[] }) {
  return (
    <li className={cn("flex items-center gap-2.5 rounded-xl px-2 py-1.5", fila.yo && "bg-primary/25")}>
      <Puesto n={fila.puesto} />
      <Avatar nombre={fila.nombre} avatar={fila.avatar} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {fila.nombre}
          {fila.yo && <span className="ml-1.5 text-xs font-normal text-muted-foreground">vos</span>}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {fila.jugadas} {fila.jugadas === 1 ? jugadas[0] : jugadas[1]}
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPuntaje(juego, fila.puntaje)}</span>
    </li>
  );
}
