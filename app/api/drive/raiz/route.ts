import { NextResponse, type NextRequest } from "next/server";
import { Drive } from "@/lib/integraciones/google";
import { esAdminApp } from "@/lib/integraciones/store";
import { idDeLink } from "@/lib/plani/drive-carpeta";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Un admin elige la carpeta raíz del Drive del estudio (ej: PAUTAS DIGITAL) pegando su link. */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv) return faltaSupabase();
  const body = (await request.json().catch(() => ({}))) as { link?: string };
  const db = createSupabaseServer();
  try {
    if (!(await esAdminApp(db))) return NextResponse.json({ error: "Solo un admin elige la carpeta raíz" }, { status: 403 });
    const drive = await Drive.desde(db);
    if (!drive) return NextResponse.json({ error: "El Drive del estudio no está conectado" }, { status: 400 });
    if (!drive.completo) return NextResponse.json({ error: "Primero volvé a conectar el Drive, con el permiso para ver las carpetas del estudio" }, { status: 400 });
    const id = idDeLink(body.link ?? "");
    if (!id) return NextResponse.json({ error: "Ese link no es de una carpeta de Drive" }, { status: 400 });
    const f = await drive.file(id, "id,name,mimeType,webViewLink").catch(() => null);
    if (!f || f.mimeType !== "application/vnd.google-apps.folder") {
      return NextResponse.json({ error: "No es una carpeta, o la cuenta conectada no la puede ver" }, { status: 400 });
    }
    await drive.elegirRaiz({ id: f.id, name: f.name, webViewLink: f.webViewLink });
    return NextResponse.json({ id: f.id, nombre: f.name, url: f.webViewLink ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
