import { NextResponse } from "next/server";
import { errorResponse, MagnificError, magnificKey } from "@/lib/magnific/api";
import { signedFilePath } from "@/lib/magnific/firma";
import { PNG_SIZES, type IconFormat, type PngSize } from "@/lib/library/iconos";
import { iconFile } from "@/lib/library/iconos.server";

export const dynamic = "force-dynamic";

/**
 * Pide el archivo de un ícono. Es POST porque gasta una descarga del plan de Magnific (un GET lo podría
 * pedir solo el navegador, por adelantado):
 *   { id, formato: "svg" | "png", tam: 64 | 128 | 256 | 512 } → { file: "/api/magnific/archivo?…", filename }
 * La página baja el archivo con ese link firmado, que vence a los 5 minutos.
 */
export async function POST(req: Request) {
  try {
    const key = magnificKey();
    if (!key) throw new MagnificError("Falta configurar MAGNIFIC_API_KEY", 503);

    const body = await req.json().catch(() => null);
    const id = Number(body?.id);
    const format = body?.formato as IconFormat;
    const size = Number(body?.tam ?? 512) as PngSize;
    if (!Number.isSafeInteger(id) || id <= 0) throw new MagnificError("Ícono inválido", 400);
    if (format !== "svg" && format !== "png") throw new MagnificError("Formato inválido", 400);
    if (!PNG_SIZES.includes(size)) throw new MagnificError("Tamaño inválido", 400);

    const file = await iconFile(id, format, size);
    return NextResponse.json({ file: await signedFilePath(file.url, key), filename: file.filename });
  } catch (e) {
    return errorResponse(e);
  }
}
