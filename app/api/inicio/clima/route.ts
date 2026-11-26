import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/inicio/clima → el tiempo en Montevideo (donde está el estudio), de Open-Meteo: gratis, sin
 * clave y sin datos de nadie (se pide siempre el mismo punto). Se guarda 15 minutos: todo el estudio
 * comparte la misma respuesta. Si Open-Meteo no contesta, 503 y el Inicio no muestra el clima.
 */

const URL_CLIMA =
  "https://api.open-meteo.com/v1/forecast?latitude=-34.9055&longitude=-56.1851" +
  "&current=temperature_2m,weather_code,is_day" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
  "&timezone=America%2FMontevideo&forecast_days=2";

type OpenMeteo = {
  current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: (number | null)[];
  };
};

export async function GET() {
  try {
    const r = await fetch(URL_CLIMA, { next: { revalidate: 900 }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as OpenMeteo;
    const c = d.current;
    if (typeof c?.temperature_2m !== "number") throw new Error("sin datos");
    const dia = (i: number) => ({
      fecha: d.daily?.time?.[i] ?? null,
      codigo: d.daily?.weather_code?.[i] ?? null,
      max: d.daily?.temperature_2m_max?.[i] ?? null,
      min: d.daily?.temperature_2m_min?.[i] ?? null,
      lluvia: d.daily?.precipitation_probability_max?.[i] ?? null,
    });
    return NextResponse.json(
      { ciudad: "Montevideo", temperatura: c.temperature_2m, codigo: c.weather_code ?? 0, deDia: c.is_day !== 0, hoy: dia(0), manana: dia(1) },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=1800" } }
    );
  } catch {
    return NextResponse.json({ error: "No se pudo leer el clima" }, { status: 503 });
  }
}
