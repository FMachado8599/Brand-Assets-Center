"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { BarButton } from "@/components/shell/ContextBar";
import { useStoredState } from "@/hooks/useStoredState";
import { useRanking } from "@/hooks/useRanking";
import type { Periodo } from "@/lib/rest/juegos";
import { JuegoShell } from "../JuegoShell";
import { Ranking } from "../Ranking";
import { Fusion } from "./Fusion";

export function FusionPagina() {
  const [periodo, setPeriodo] = useStoredState<Periodo>("rest:periodo", "semana");
  /** Cambia en cada partida nueva: el tablero se vuelve a armar de cero (y la de antes, si quedó a medias, se guarda). */
  const [ronda, setRonda] = useState(0);
  const tabla = useRanking("fusion", "", periodo);
  // Tu mejor de siempre, para el récord del juego (el ranking de al lado puede ser el de la semana).
  const propio = useRanking("fusion", "", "siempre", 1);
  const mejor = propio.filas.find((f) => f.yo)?.puntaje ?? null;
  const otra = () => setRonda((r) => r + 1);

  return (
    <JuegoShell
      actual="fusion"
      barra={<BarButton label="Nueva partida" icon={RotateCcw} onClick={otra} />}
      ranking={<Ranking juego="fusion" {...tabla} periodo={periodo} onPeriodo={setPeriodo} />}
    >
      <Fusion
        key={ronda}
        mejor={mejor}
        onOtra={otra}
        onGuardada={() => {
          tabla.reload();
          propio.reload();
        }}
      />
    </JuegoShell>
  );
}
