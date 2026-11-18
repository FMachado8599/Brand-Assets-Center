import { NextResponse, type NextRequest } from "next/server";
import { MESES, TIPOS } from "@/lib/plani/config";
import { etiquetaArchivo, etiquetaDia } from "@/lib/plani/fechas";
import type { PlaniTipo } from "@/lib/plani/types";
import { Drive, FILE_FIELDS, type DriveFile } from "@/lib/integraciones/google";
import { appOrigin } from "@/lib/integraciones/store";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Hasta 5 GB por archivo: un reel en 4K entra de sobra. */
const MAX_BYTES = 5 * 1024 ** 3;

type PiezaConPlani = {
  id: string;
  fecha: string;
  formato: string;
  planificaciones: { id: string; anio: number; mes: number; tipo: PlaniTipo; brands: { id: string; name: string } | null } | null;
};

/**
 * Abre la subida de un archivo del material final de una pieza. Arma (o reusa) las carpetas
 * Cliente / AAAA-MM Plani Mes / DD-MM Día en el Drive del estudio y devuelve la URL a la que el
 * navegador sube el archivo directo a Google.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { piezaId?: string; nombre?: string; mime?: string; tamano?: number };
  const { piezaId, nombre, mime = "", tamano } = body;
  if (!piezaId || !nombre || typeof tamano !== "number" || tamano <= 0) {
    return NextResponse.json({ error: "Faltan datos del archivo" }, { status: 400 });
  }
  if (!/^(image|video)\//.test(mime)) return NextResponse.json({ error: "Solo imágenes o videos" }, { status: 400 });
  if (tamano > MAX_BYTES) return NextResponse.json({ error: "El archivo pesa más de 5 GB" }, { status: 400 });

  const db = createSupabaseServer();
  try {
    const drive = await Drive.desde(db);
    if (!drive) return NextResponse.json({ error: "El Drive del estudio no está conectado", sinDrive: true }, { status: 400 });

    const { data, error } = await db
      .from("plani_piezas")
      .select("id, fecha, formato, planificaciones(id, anio, mes, tipo, brands(id, name))")
      .eq("id", piezaId)
      .maybeSingle<PiezaConPlani>();
    if (error) throw new Error(error.message);
    const plani = data?.planificaciones;
    if (!data || !plani) return NextResponse.json({ error: "No existe esa pieza" }, { status: 404 });

    const raiz = await drive.raiz();
    const cliente = plani.brands;
    const carpetaCliente = await drive.carpeta(`cliente:${cliente?.id ?? "sin"}`, cliente?.name ?? "Sin cliente", raiz);
    const carpetaPlani = await drive.carpeta(
      `plani:${plani.id}`,
      `${plani.anio}-${String(plani.mes).padStart(2, "0")} · ${TIPOS[plani.tipo].label} ${MESES[plani.mes - 1]} ${plani.anio}`,
      carpetaCliente
    );
    if (!plani.id) throw new Error("Plani sin id");
    const carpetaDia = await drive.carpeta(
      `dia:${plani.id}:${data.fecha}`,
      `${etiquetaArchivo(data.fecha)} ${etiquetaDia(data.fecha).split(" ")[0]}`,
      carpetaPlani
    );
    // La carpeta de la plani queda anotada para el botón "Abrir en Drive".
    await db.from("planificaciones").update({ drive_carpeta_id: carpetaPlani }).eq("id", plani.id).is("drive_carpeta_id", null);

    const uploadUrl = await drive.sesionDeSubida({
      nombre,
      mime,
      tamano,
      carpeta: carpetaDia,
      origin: request.headers.get("origin") || appOrigin(request.url),
    });
    return NextResponse.json({ uploadUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Si el navegador no pudo leer la respuesta de Google al terminar (CORS), se pregunta desde acá
 * cómo quedó la subida: con "bytes *\/tamaño" Google responde el archivo si ya está completo.
 */
export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { uploadUrl?: string; tamano?: number };
  if (!body.uploadUrl?.startsWith("https://www.googleapis.com/upload/drive/") || typeof body.tamano !== "number") {
    return NextResponse.json({ error: "Subida desconocida" }, { status: 400 });
  }
  try {
    const drive = await Drive.desde(createSupabaseServer());
    if (!drive) return NextResponse.json({ error: "El Drive del estudio no está conectado" }, { status: 400 });
    const r = await drive.fetch(body.uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes */${body.tamano}` } });
    if (r.status === 200 || r.status === 201) {
      const file = (await r.json()) as DriveFile;
      // La respuesta de la sesión trae los campos pedidos al abrirla; por las dudas se completa.
      return NextResponse.json({ file: file.mimeType ? file : await drive.file(file.id, FILE_FIELDS) });
    }
    return NextResponse.json({ error: "La subida no terminó", estado: r.status }, { status: 409 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
