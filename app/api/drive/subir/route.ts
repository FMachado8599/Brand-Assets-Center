import { NextResponse, type NextRequest } from "next/server";
import { etiquetaArchivo, etiquetaDia } from "@/lib/plani/fechas";
import { Drive, FILE_FIELDS, type DriveFile } from "@/lib/integraciones/google";
import { appOrigin } from "@/lib/integraciones/store";
import { crearCamino, SELECT_PRESENTACION, sinCarpeta, sugerida, usarCarpeta, type PresentacionDrive } from "@/lib/plani/drive-carpeta";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Hasta 5 GB por archivo: un reel en 4K entra de sobra. */
const MAX_BYTES = 5 * 1024 ** 3;

type PiezaConPlani = { id: string; fecha: string; formato: string; presentaciones: PresentacionDrive | null };

/**
 * Abre la subida de un archivo del material de una pieza y devuelve la URL a la que el navegador
 * lo sube directo a Google. Va a la carpeta de la presentación, en una carpeta por día; si todavía
 * no tiene, a la que le toca (PAUTAS DIGITAL / año / marca / mes / tipo) cuando la marca aparece, y
 * si no, a "Sin carpeta" hasta que alguien la elija (ver lib/plani/drive-carpeta.ts).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { piezaId?: string; nombre?: string; mime?: string; tamano?: number; rol?: string };
  const { piezaId, nombre, mime = "", tamano, rol } = body;
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
      .from("presentacion_piezas")
      .select(`id, fecha, formato, presentaciones(${SELECT_PRESENTACION})`)
      .eq("id", piezaId)
      .maybeSingle<PiezaConPlani>();
    if (error) throw new Error(error.message);
    const plani = data?.presentaciones;
    if (!data || !plani) return NextResponse.json({ error: "No existe esa pieza" }, { status: 404 });

    let carpetaPlani = plani.drive_carpeta_id;
    if (!carpetaPlani) {
      const s = await sugerida(drive, db, plani).catch(() => null);
      if (s && !s.falta) {
        carpetaPlani = await crearCamino(drive, s.pasos);
        await usarCarpeta(drive, db, plani, carpetaPlani);
      }
    }
    const padre = carpetaPlani ?? (await sinCarpeta(drive, plani));
    const carpetaDia = await drive.carpeta(`dia:${plani.id}:${data.fecha}`, `${etiquetaArchivo(data.fecha)} ${etiquetaDia(data.fecha).split(" ")[0]}`, padre);
    // La inspiración de Redacción va aparte (no es parte de la entrega).
    const destino =
      rol === "referencia" ? await drive.carpeta(`insp:${plani.id}:${data.fecha}`, "Inspiración", carpetaDia) : carpetaDia;

    const uploadUrl = await drive.sesionDeSubida({
      nombre,
      mime,
      tamano,
      carpeta: destino,
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
