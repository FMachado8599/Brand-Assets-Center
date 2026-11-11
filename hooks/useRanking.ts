"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JuegoId, Periodo } from "@/lib/rest/juegos";
import { LIMITE_RANKING, leerRanking, type EstadoRanking, type FilaRanking, type Modo } from "@/lib/rest/partidas";

/**
 * El ranking de un juego (y dificultad) para un período. Se vuelve a leer al volver a la pestaña,
 * para ver lo que jugaron los demás mientras tanto, y con reload() después de cada partida.
 */
export function useRanking(juego: JuegoId, modo: Modo, periodo: Periodo, limite = LIMITE_RANKING) {
  const [filas, setFilas] = useState<FilaRanking[]>([]);
  const [estado, setEstado] = useState<EstadoRanking>("ok");
  const [loading, setLoading] = useState(true);
  /** Solo cuenta la última lectura: si se cambia de período rápido, no pisa una respuesta vieja. */
  const turno = useRef(0);

  const reload = useCallback(async () => {
    const mio = ++turno.current;
    const res = await leerRanking(juego, modo, periodo, limite);
    if (mio !== turno.current) return;
    setFilas(res.filas);
    setEstado(res.estado);
    setLoading(false);
  }, [juego, modo, periodo, limite]);

  useEffect(() => {
    setLoading(true);
    reload();
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  return { filas, estado, loading, reload };
}
