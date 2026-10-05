import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const hasSupabase = Boolean(url && key);
export const supabaseUrl = url;
export const supabaseAnonKey = key;

/**
 * Cliente del navegador. Guarda la sesión (login con Google) en cookies, así
 * las rutas del servidor (/api/visits, /auth/callback) también la leen.
 * Sin variables de entorno se crea con valores de relleno: la app muestra
 * "Falta configurar" y no llega a usarlo.
 */
export const supabase = createBrowserClient(url || "http://localhost", key || "sin-configurar");
