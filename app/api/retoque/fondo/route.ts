import { NextResponse } from "next/server";
import { errorResponse, MagnificError, magnificKey } from "@/lib/magnific/api";
import { signedFilePath } from "@/lib/magnific/firma";
import { removeBackground } from "@/lib/retoque/fondo";
import { isOwnPath, RETOQUE_BUCKET, storageMessage } from "@/lib/retoque/storage";
import { createSupabaseServer, faltaSupabase, hasSupabaseEnv } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
// Magnific contesta en segundos, pero una imagen grande puede tardar más que los 10 s de un plan básico.
export const maxDuration = 60;

/** Lo que quedó subido de un intento que no terminó (se cerró la pestaña a mitad de camino). */
const STALE_MS = 60 * 60 * 1000;

/**
 * Quita el fondo de una imagen que el navegador ya subió a Storage (lib/retoque/storage.ts):
 *   { path: "<id de la cuenta>/<uuid>.jpg" } → { file: "/api/magnific/archivo?…" }
 * La imagen subida se borra al terminar, salga bien o mal. El resultado no se guarda: la página lo baja
 * con el link firmado de `file`, que vence a los 5 minutos.
 */
export async function POST(req: Request) {
  if (!hasSupabaseEnv) return faltaSupabase();
  try {
    const key = magnificKey();
    if (!key) throw new MagnificError("Falta configurar MAGNIFIC_API_KEY", 503);

    const supabase = createSupabaseServer();
    const { data } = await supabase.auth.getClaims();
    const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
    if (!userId) throw new MagnificError("Iniciá sesión con tu cuenta del estudio", 401);

    const body = await req.json().catch(() => null);
    const path = String(body?.path ?? "");
    if (!isOwnPath(path, userId)) throw new MagnificError("Imagen inválida", 400);

    const bucket = supabase.storage.from(RETOQUE_BUCKET);
    try {
      // Magnific baja la imagen de este link mientras dura el pedido; 10 minutos sobran.
      const { data: signed, error } = await bucket.createSignedUrl(path, 600);
      if (error || !signed?.signedUrl) throw new MagnificError(storageMessage(error), 422);

      const result = await removeBackground(signed.signedUrl);
      return NextResponse.json({ file: await signedFilePath(result.url, key) });
    } finally {
      await Promise.all([bucket.remove([path]), removeStale(bucket, userId)]).catch(() => {});
    }
  } catch (e) {
    return errorResponse(e);
  }
}

type Bucket = ReturnType<ReturnType<typeof createSupabaseServer>["storage"]["from"]>;

async function removeStale(bucket: Bucket, userId: string) {
  const { data } = await bucket.list(userId, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
  const old = (data ?? [])
    .filter((f) => f.created_at && Date.now() - new Date(f.created_at).getTime() > STALE_MS)
    .map((f) => `${userId}/${f.name}`);
  if (old.length) await bucket.remove(old);
}
