import type { Dificultad, JuegoId, Periodo } from "./juegos";

/** El cliente de Supabase se carga recién cuando hace falta (como en el resto de la app). */
const loadClient = () => import("@/lib/supabase").then((m) => m.supabase);

const configurada = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Cómo está el ranking: listo, sin base en este entorno, sin la migración corrida o caído. */
export type EstadoRanking = "ok" | "sin-base" | "sin-migracion" | "error";

/** Una fila de ranking_juego() (migracion-juegos.sql): el mejor puntaje de una persona. */
export type FilaRanking = {
  puesto: number;
  nombre: string;
  avatar: string | null;
  puntaje: number;
  logrado: string;
  jugadas: number;
  /** Sos vos. */
  yo: boolean;
};

/** Lo que contesta la base al guardar un puntaje. */
export type Resultado = { record: boolean; puestoSemana: number | null; puestoSiempre: number | null };

type ErrorDeBase = { code?: string; message?: string } | null;

const faltaMigracion = (error: ErrorDeBase) => error?.code === "PGRST202" || error?.code === "42883";

export const mensaje = (error: unknown) =>
  error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "Algo falló";

/** Cuántos muestra cada ranking (y, si estás más abajo, tu fila aparte). */
export const LIMITE_RANKING = 20;

/** "" en el dino; la dificultad en el buscaminas. */
export type Modo = Dificultad | "";

/**
 * Abre una partida en la base y devuelve su id (o null si no hay ranking: sin base, sin
 * sesión, sin la migración). Se llama al arrancar a jugar, sin esperar la respuesta.
 */
export async function empezarPartida(juego: JuegoId, modo: Modo): Promise<string | null> {
  if (!configurada) return null;
  try {
    const supabase = await loadClient();
    const { data, error } = await supabase.rpc("empezar_partida", { p_juego: juego, p_modo: modo });
    if (error) {
      if (!faltaMigracion(error)) console.warn("[rest] no se pudo empezar la partida:", error.message);
      return null;
    }
    return typeof data === "string" ? data : null;
  } catch {
    return null;
  }
}

/** Guarda el puntaje de una partida. Si la base lo rechaza, tira el error con su mensaje. */
export async function terminarPartida(id: string, puntaje: number): Promise<Resultado> {
  const supabase = await loadClient();
  const { data, error } = await supabase.rpc("terminar_partida", { p_id: id, p_puntaje: Math.round(puntaje) });
  if (error) throw error;
  const fila = (Array.isArray(data) ? data[0] : data) as
    | { es_record: boolean; puesto_semana: number | null; puesto_siempre: number | null }
    | undefined;
  return {
    record: !!fila?.es_record,
    puestoSemana: fila?.puesto_semana == null ? null : Number(fila.puesto_semana),
    puestoSiempre: fila?.puesto_siempre == null ? null : Number(fila.puesto_siempre),
  };
}

export async function leerRanking(
  juego: JuegoId,
  modo: Modo,
  periodo: Periodo,
  limite = LIMITE_RANKING
): Promise<{ estado: EstadoRanking; filas: FilaRanking[] }> {
  if (!configurada) return { estado: "sin-base", filas: [] };
  try {
    const supabase = await loadClient();
    const { data, error } = await supabase.rpc("ranking_juego", {
      p_juego: juego,
      p_modo: modo,
      p_periodo: periodo,
      p_limite: limite,
    });
    if (error) {
      if (faltaMigracion(error)) return { estado: "sin-migracion", filas: [] };
      console.warn("[rest] no se pudo leer el ranking:", error.message);
      return { estado: "error", filas: [] };
    }
    const filas = ((data ?? []) as FilaRanking[]).map((f) => ({
      ...f,
      puesto: Number(f.puesto),
      puntaje: Number(f.puntaje),
      jugadas: Number(f.jugadas),
    }));
    return { estado: "ok", filas };
  } catch {
    return { estado: "error", filas: [] };
  }
}
