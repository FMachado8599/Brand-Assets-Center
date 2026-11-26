"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CancionSpotify, EstadoJam } from "@/lib/spotify/types";

/**
 * El Jam del estudio visto desde la app: se relee cada `cadaMs` mientras la pestaña está a la
 * vista (el servidor comparte la respuesta entre todos, ver lib/spotify/jam.ts).
 * Sin Supabase, sin migración o sin Jam armado, `estado.dj` es null o hay `error`.
 */
export function useSpotifyJam(activo: boolean, cadaMs = 10_000) {
  const [estado, setEstado] = useState<EstadoJam | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Cuándo llegó `estado` a este navegador: con eso el progreso avanza sin volver a preguntar. */
  const recibido = useRef(0);

  const leer = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/jam", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as EstadoJam & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo leer el Jam");
      recibido.current = Date.now();
      setEstado(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!activo) return;
    leer();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") leer();
    }, cadaMs);
    const alVolver = () => document.visibilityState === "visible" && leer();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [activo, cadaMs, leer]);

  /** Dónde va la canción ahora (ms), contando lo que pasó desde que se le preguntó a Spotify. */
  const posicion = useCallback(() => {
    if (!estado?.actual) return 0;
    const extra = estado.sonando ? estado.leidoHace + (Date.now() - recibido.current) : 0;
    return Math.min(estado.actual.duracion, estado.progreso + extra);
  }, [estado]);

  /** "ok", "ya-esta" (no se suma) o el mensaje de error. */
  const sumar = useCallback(
    async (c: CancionSpotify): Promise<"ok" | "ya-esta" | string> => {
      const res = await fetch("/api/spotify/cola", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri: c.uri, nombre: c.nombre, artistas: c.artistas }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        // Se muestra al toque; Spotify tarda un instante en reflejarla en la cola.
        setEstado((e) => (e ? { ...e, siguientes: [...e.siguientes, c] } : e));
        setTimeout(leer, 1500);
        return "ok";
      }
      if (res.status === 409 && /ya está/i.test(data.error ?? "")) return "ya-esta";
      return data.error ?? "No se pudo sumar la canción";
    },
    [leer]
  );

  return { estado, error, posicion, sumar, refrescar: leer };
}
