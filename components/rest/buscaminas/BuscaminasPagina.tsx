"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { BarButton, BarSegmented } from "@/components/shell/ContextBar";
import { useStoredState } from "@/hooks/useStoredState";
import { useRanking } from "@/hooks/useRanking";
import { DIFICULTADES, dificultad, type Dificultad, type Periodo } from "@/lib/rest/juegos";
import { JuegoShell } from "../JuegoShell";
import { Ranking } from "../Ranking";
import { Buscaminas } from "./Buscaminas";

export function BuscaminasPagina() {
  const [periodo, setPeriodo] = useStoredState<Periodo>("rest:periodo", "semana");
  const [nivel, setNivel] = useStoredState<Dificultad>("rest:buscaminas:nivel", "principiante");
  /** Cambia en cada partida nueva: el tablero se vuelve a armar de cero. */
  const [ronda, setRonda] = useState(0);
  const tabla = useRanking("buscaminas", nivel, periodo);
  const otra = () => setRonda((r) => r + 1);

  // F2, como en el de Windows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F2") return;
      e.preventDefault();
      setRonda((r) => r + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <JuegoShell
      actual="buscaminas"
      barra={
        <>
          <BarSegmented
            label="Dificultad"
            value={nivel}
            onChange={(v) => {
              setNivel(v);
              otra();
            }}
            options={DIFICULTADES.map((d) => ({ value: d.value, label: d.label }))}
          />
          <BarButton label="Nueva partida (F2)" icon={RotateCcw} onClick={otra} />
        </>
      }
      ranking={
        <Ranking
          juego="buscaminas"
          titulo={dificultad(nivel).label}
          {...tabla}
          periodo={periodo}
          onPeriodo={setPeriodo}
        />
      }
    >
      <Buscaminas key={`${nivel}-${ronda}`} nivel={nivel} onGuardada={tabla.reload} />
    </JuegoShell>
  );
}
