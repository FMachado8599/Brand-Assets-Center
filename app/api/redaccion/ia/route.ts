import { NextResponse } from "next/server";
import {
  ErrorIA,
  MAX_ANTES,
  MAX_DESPUES,
  MAX_EJEMPLO,
  MAX_EJEMPLOS,
  MAX_FRAGMENTO,
  MAX_MATERIAL,
  MAX_NOTAS,
  MAX_PREFIJO,
  sugerirPalabras,
  type PedidoIA,
} from "@/lib/redaccion/ia.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/redaccion/ia  { antes, despues?, prefijo?, cliente?: { nombre, notas }, ejemplos?: string[], material?: string[] }
 * → { opciones: string[], modo: "completar" | "seguir" }  (hasta 3 palabras), o { error } con un mensaje para mostrar tal cual.
 * Solo para gente del estudio: la sesión la exige el middleware.
 */

const texto = (v: unknown, max: number, fin: "inicio" | "final" = "inicio") => {
  if (typeof v !== "string") return "";
  const t = v.replace(/\r\n/g, "\n");
  // De lo que se pasa de largo, lo que importa es lo más cercano al cursor.
  return (fin === "final" ? t.slice(-max) : t.slice(0, max)).trim();
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  const antes = texto(body.antes, MAX_ANTES, "final");
  if (!antes) return NextResponse.json({ error: "Escribí algo primero: la IA sugiere palabras según lo que ya escribiste." }, { status: 400 });

  const c = body.cliente as Record<string, unknown> | undefined;
  const ejemplos = Array.isArray(body.ejemplos)
    ? body.ejemplos
        .map((e) => texto(e, MAX_EJEMPLO))
        .filter(Boolean)
        .slice(0, MAX_EJEMPLOS)
    : [];

  const material = Array.isArray(body.material)
    ? body.material
        .map((m) => texto(m, MAX_FRAGMENTO))
        .filter(Boolean)
        .slice(0, MAX_MATERIAL)
    : [];

  const pedido: PedidoIA = {
    // Si lo último que hay es un espacio, se conserva: es lo que dice que el cursor está entre palabras.
    antes: typeof body.antes === "string" && /\s$/.test(body.antes) ? `${antes} ` : antes,
    despues: texto(body.despues, MAX_DESPUES),
    prefijo: texto(body.prefijo, MAX_PREFIJO),
    cliente: c && typeof c === "object" ? { nombre: texto(c.nombre, 120), notas: texto(c.notas, MAX_NOTAS) } : undefined,
    ejemplos,
    material,
  };

  try {
    return NextResponse.json(await sugerirPalabras(pedido));
  } catch (e) {
    if (e instanceof ErrorIA) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[redaccion-ia]", e);
    return NextResponse.json({ error: "La IA no pudo sugerir palabras." }, { status: 500 });
  }
}
