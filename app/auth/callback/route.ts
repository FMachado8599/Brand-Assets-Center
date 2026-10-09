import { NextResponse } from "next/server";
import { createSupabaseServer, safeNext } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Vuelta del login con Google: Supabase nos manda un código de un solo uso,
 * lo cambiamos por la sesión (queda en cookies) y volvemos a la página desde
 * la que se inició sesión.
 */
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");

  if (code) {
    const supabase = createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error("[login] no se pudo canjear el código:", error.message);
  }

  // Google o Supabase devolvieron un error (o el usuario canceló): avisamos con ?login=error.
  // Si la base rechazó crear la cuenta (mail de otro dominio, ver supabase/migracion-acceso.sql),
  // Supabase lo informa como "Database error saving new user": avisamos con ?login=sin-acceso.
  const denied = /saving new user/i.test(searchParams.get("error_description") ?? "");
  return NextResponse.redirect(`${origin}${next}${next.includes("?") ? "&" : "?"}login=${denied ? "sin-acceso" : "error"}`);
}
