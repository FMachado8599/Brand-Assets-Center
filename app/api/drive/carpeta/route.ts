import { NextResponse, type NextRequest } from "next/server";
import { studioSession } from "@/lib/access";
import { Drive } from "@/lib/integraciones/google";
import { crearCamino, idDeLink, SELECT_PRESENTACION, sugerida, usarCarpeta, type PresentacionDrive } from "@/lib/plani/drive-carpeta";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const FOLDER = "application/vnd.google-apps.folder";

async function cargar(db: ReturnType<typeof createSupabaseServer>, id: string | null | undefined) {
  if (!id) return null;
  const { data, error } = await db.from("presentaciones").select(SELECT_PRESENTACION).eq("id", id).maybeSingle<PresentacionDrive>();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * La carpeta de Drive de una presentación: la que tiene (con su camino desde la raíz) y la que le
 * tocaría (PAUTAS DIGITAL / año / marca / mes / tipo), con lo que ya existe y lo que faltaría crear.
 */
export async function GET(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const db = createSupabaseServer();
  try {
    if (!(await studioSession(db))) return NextResponse.json({ error: "Solo el estudio" }, { status: 401 });
    const p = await cargar(db, request.nextUrl.searchParams.get("presentacion"));
    if (!p) return NextResponse.json({ error: "No existe esa presentación" }, { status: 404 });
    const drive = await Drive.desde(db);
    if (!drive) return NextResponse.json({ sinDrive: true });
    const raiz = drive.raizElegida ? await drive.raiz() : null;
    const actual = p.drive_carpeta_id
      ? {
          id: p.drive_carpeta_id,
          ruta: raiz ? await drive.ruta(p.drive_carpeta_id, raiz).catch(() => null) : null,
        }
      : null;
    return NextResponse.json({
      completo: drive.completo,
      raiz: raiz ? { id: raiz, nombre: drive.datos.raiz_nombre ?? "Raíz" } : null,
      actual,
      sugerida: await sugerida(drive, db, p),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Elige la carpeta: { sugerida: true } (crea lo que falte del camino), o { carpeta } con el id o el
 * link de una carpeta de adentro de la raíz. Mueve ahí lo que ya se había subido.
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const body = (await request.json().catch(() => ({}))) as { presentacion?: string; sugerida?: boolean; carpeta?: string };
  const db = createSupabaseServer();
  try {
    if (!(await studioSession(db))) return NextResponse.json({ error: "Solo el estudio" }, { status: 401 });
    const p = await cargar(db, body.presentacion);
    if (!p) return NextResponse.json({ error: "No existe esa presentación" }, { status: 404 });
    const drive = await Drive.desde(db);
    if (!drive) return NextResponse.json({ error: "El Drive del estudio no está conectado" }, { status: 400 });
    if (!drive.completo) return NextResponse.json({ error: "Hay que volver a conectar el Drive para usar las carpetas del estudio" }, { status: 400 });

    let carpeta: string;
    if (body.sugerida) {
      const s = await sugerida(drive, db, p);
      if (s.falta === "raiz") return NextResponse.json({ error: "Falta que un admin elija la carpeta raíz del Drive" }, { status: 400 });
      if (s.falta === "marca") return NextResponse.json({ error: `No está la carpeta de ${p.brands?.name ?? "la marca"} en ${p.anio}: elegila o pegá su link` }, { status: 400 });
      carpeta = await crearCamino(drive, s.pasos);
    } else {
      const id = idDeLink(body.carpeta ?? "");
      if (!id) return NextResponse.json({ error: "Ese link no es de una carpeta de Drive" }, { status: 400 });
      const f = await drive.file(id, "id,name,mimeType,trashed").catch(() => null);
      if (!f || f.mimeType !== FOLDER) return NextResponse.json({ error: "No es una carpeta, o la cuenta del estudio no la puede ver" }, { status: 400 });
      // Solo adentro de la raíz del estudio (si hay una elegida).
      if (drive.raizElegida && !(await drive.ruta(id, await drive.raiz()))) {
        return NextResponse.json({ error: `Esa carpeta no está adentro de ${drive.datos.raiz_nombre ?? "la carpeta raíz"}` }, { status: 400 });
      }
      carpeta = id;
    }
    const ruta = await usarCarpeta(drive, db, p, carpeta);
    return NextResponse.json({ id: carpeta, ruta });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
