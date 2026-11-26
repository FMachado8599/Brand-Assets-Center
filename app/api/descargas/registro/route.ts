import { NextResponse } from "next/server";
import { desdeOficina } from "@/lib/downloads/oficina.server";
import { limpiarRegistro, type RegistroDescarga } from "@/lib/downloads/registro";
import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Anota lo que alguien bajó desde Descargas (para las métricas, /descargas/metricas). Lo manda la página
 * después de cada guardado: { items: [...] }. Quién es lo pone la base con la sesión; si fue desde la
 * oficina, lo decide acá comparando la IP en el momento (no se guarda). Si algo falla no se avisa: la
 * descarga ya se hizo y el registro no puede molestar.
 */
const MAX_ITEMS = 60;

export async function POST(req: Request) {
  if (!hasSupabaseEnv) return new NextResponse(null, { status: 204 });
  const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
  const items = Array.isArray(body?.items)
    ? body.items.slice(0, MAX_ITEMS).map(limpiarRegistro).filter((r): r is RegistroDescarga => r !== null)
    : [];
  if (!items.length) return NextResponse.json({ error: "Nada para anotar" }, { status: 400 });

  const oficina = await desdeOficina(req);
  const supabase = createSupabaseServer();
  const { error } = await supabase.from("descargas_registro").insert(items.map((r) => ({ ...r, desde_oficina: oficina })));
  if (error) {
    // 42P01: todavía no se corrió supabase/migracion-descargas-registro.sql.
    if (error.code !== "42P01" && error.code !== "PGRST205") console.error("[descargas/registro]", error.message);
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, { status: 204 });
}
