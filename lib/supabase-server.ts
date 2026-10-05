import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const hasSupabaseEnv = Boolean(url && key);

/**
 * Cliente de Supabase para rutas del servidor: lee la sesión de las cookies
 * del pedido y, si hay que renovarla, escribe las cookies nuevas en la respuesta.
 */
export function createSupabaseServer() {
  const store = cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Desde un Server Component no se pueden escribir cookies: no pasa nada, se renuevan en el próximo pedido.
        }
      },
    },
  });
}

/** Solo rutas internas ("/emojis?c=…"), nunca "//otro-sitio.com": evita redirecciones abiertas. */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
