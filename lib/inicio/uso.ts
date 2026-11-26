/**
 * Anota lo que se hace con las herramientas (supabase/migracion-inicio.sql → uso_herramientas):
 * copiar un emoji, convertir un archivo, exportar banners. Con eso salen "Tus números del mes", el
 * emoji del estudio y el Wrapped. Se manda sin esperar y, si falla (sin sesión, sin la migración),
 * no pasa nada: nunca frena lo que estabas haciendo.
 */

export type TipoUso = "emoji" | "gif" | "icono" | "conversion" | "compresion" | "retoque" | "banner" | "tarjeta" | "redaccion";

const configurada = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const loadClient = () => import("@/lib/supabase").then((m) => m.supabase);

/** Si la tabla no está (falta la migración), se deja de intentar hasta recargar. */
let apagado = false;

export function registrarUso(tipo: TipoUso, extra: { detalle?: string | null; cantidad?: number; bytes?: number | null; brandId?: string | null } = {}) {
  if (!configurada || apagado || typeof window === "undefined") return;
  const fila = {
    tipo,
    detalle: extra.detalle ? extra.detalle.slice(0, 60) : null,
    cantidad: Math.max(1, Math.min(500, Math.round(extra.cantidad ?? 1))),
    bytes: extra.bytes != null && extra.bytes >= 0 ? Math.round(extra.bytes) : null,
    brand_id: extra.brandId ?? null,
  };
  void (async () => {
    try {
      const supabase = await loadClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { error } = await supabase.from("uso_herramientas").insert(fila);
      if (error && /uso_herramientas|does not exist|schema cache|42P01/i.test(error.message)) apagado = true;
    } catch {
      /* sin red: no se anota */
    }
  })();
}
