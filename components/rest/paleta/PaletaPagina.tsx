"use client";

import { useStoredState } from "@/hooks/useStoredState";
import { useRanking } from "@/hooks/useRanking";
import type { Periodo } from "@/lib/rest/juegos";
import { JuegoShell } from "../JuegoShell";
import { Ranking } from "../Ranking";
import { Paleta } from "./Paleta";

export function PaletaPagina() {
  const [periodo, setPeriodo] = useStoredState<Periodo>("rest:periodo", "semana");
  const tabla = useRanking("paleta", "", periodo);
  // Tu mejor de siempre, para el récord del juego (el ranking de al lado puede ser el de la semana).
  const propio = useRanking("paleta", "", "siempre", 1);
  const mejor = propio.filas.find((f) => f.yo)?.puntaje ?? null;

  return (
    <JuegoShell actual="paleta" ranking={<Ranking juego="paleta" {...tabla} periodo={periodo} onPeriodo={setPeriodo} />}>
      <Paleta
        mejor={mejor}
        onGuardada={() => {
          tabla.reload();
          propio.reload();
        }}
      />
    </JuegoShell>
  );
}
