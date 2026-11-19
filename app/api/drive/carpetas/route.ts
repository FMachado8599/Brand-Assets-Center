import { NextResponse, type NextRequest } from "next/server";
import { studioSession } from "@/lib/access";
import { Drive } from "@/lib/integraciones/google";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Para elegir una carpeta a mano: las que hay adentro de una (?en=<id>; sin nada, la raíz), con el
 * camino desde la raíz. Solo se navega adentro de la raíz que eligió un admin.
 */
export async function GET(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const db = createSupabaseServer();
  try {
    if (!(await studioSession(db))) return NextResponse.json({ error: "Solo el estudio" }, { status: 401 });
    const drive = await Drive.desde(db);
    if (!drive) return NextResponse.json({ error: "El Drive del estudio no está conectado" }, { status: 400 });
    if (!drive.completo || !drive.raizElegida) return NextResponse.json({ error: "Falta la carpeta raíz del Drive (la elige un admin)" }, { status: 400 });
    const raiz = await drive.raiz();
    const en = request.nextUrl.searchParams.get("en") || raiz;
    const ruta = await drive.ruta(en, raiz).catch(() => null);
    if (!ruta) return NextResponse.json({ error: "Esa carpeta no está adentro de la raíz" }, { status: 403 });
    const hijas = await drive.carpetasEn(en);
    return NextResponse.json({ ruta, hijas });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Crea una carpeta adentro de otra (siempre dentro de la raíz): ej, la de una marca nueva. */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const body = (await request.json().catch(() => ({}))) as { en?: string; nombre?: string };
  const db = createSupabaseServer();
  try {
    if (!(await studioSession(db))) return NextResponse.json({ error: "Solo el estudio" }, { status: 401 });
    const nombre = body.nombre?.trim();
    if (!body.en || !nombre) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
    const drive = await Drive.desde(db);
    if (!drive || !drive.completo || !drive.raizElegida) return NextResponse.json({ error: "Falta la carpeta raíz del Drive" }, { status: 400 });
    if (!(await drive.ruta(body.en, await drive.raiz()).catch(() => null))) {
      return NextResponse.json({ error: "Esa carpeta no está adentro de la raíz" }, { status: 403 });
    }
    const existe = (await drive.carpetasEn(body.en)).find((c) => c.name.trim().toLowerCase() === nombre.toLowerCase());
    const carpeta = existe ?? (await drive.crearCarpeta(nombre, body.en));
    return NextResponse.json({ id: carpeta.id, nombre: carpeta.name });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
