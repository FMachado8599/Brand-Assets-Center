import { NextResponse, type NextRequest } from "next/server";
import { Drive } from "@/lib/integraciones/google";
import { servirArchivo, VALID_DRIVE_ID } from "@/lib/integraciones/servir";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Un archivo del Drive del estudio, para el estudio (con sesión). Ver lib/integraciones/servir.ts. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!VALID_DRIVE_ID.test(params.id)) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
  try {
    const drive = await Drive.desde(createSupabaseServer());
    if (!drive) return NextResponse.json({ error: "El Drive del estudio no está conectado" }, { status: 503 });
    return await servirArchivo(drive, params.id, request);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Saca un archivo de una pieza: va a la papelera del Drive (se puede recuperar desde ahí). Con el
 * permiso drive.file la app solo alcanza los archivos que subió ella: el resto del Drive no se toca.
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!VALID_DRIVE_ID.test(params.id)) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
  try {
    const drive = await Drive.desde(createSupabaseServer());
    if (!drive) return NextResponse.json({ error: "El Drive del estudio no está conectado" }, { status: 503 });
    await drive.borrar(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
