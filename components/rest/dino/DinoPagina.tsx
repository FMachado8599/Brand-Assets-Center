"use client";

import { useStoredState } from "@/hooks/useStoredState";
import { useRanking } from "@/hooks/useRanking";
import type { Periodo } from "@/lib/rest/juegos";
import { JuegoShell } from "../JuegoShell";
import { Ranking } from "../Ranking";
import { DinoGame } from "./DinoGame";

export function DinoPagina() {
  const [periodo, setPeriodo] = useStoredState<Periodo>("rest:periodo", "semana");
  const tabla = useRanking("dino", "", periodo);
  // Tu mejor de siempre, para el HI del juego (el ranking de arriba puede ser el de la semana).
  const propio = useRanking("dino", "", "siempre", 1);
  const mejor = propio.filas.find((f) => f.yo)?.puntaje ?? null;

  return (
    <JuegoShell
      actual="dino"
      ranking={<Ranking juego="dino" {...tabla} periodo={periodo} onPeriodo={setPeriodo} />}
    >
      <DinoGame
        mejor={mejor}
        onGuardada={() => {
          tabla.reload();
          propio.reload();
        }}
      />
    </JuegoShell>
  );
}
