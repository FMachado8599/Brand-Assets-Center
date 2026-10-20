import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { studioSession } from "@/lib/access";

/**
 * Las herramientas son solo para el estudio: sin sesión de una cuenta @camaratbwa.com (o de la
 * lista de excepciones) las páginas mandan a Inicio a iniciar sesión y las APIs responden 401.
 * Los datos los protege la base (supabase/migracion-acceso.sql); esto evita pantallas vacías y
 * que las APIs pagas (Conversor, búsqueda de emojis) se usen de afuera.
 */
// /api/sugerencias es pública a propósito: "no puedo entrar" también hay que poder avisarlo (tiene su propio límite).
// Inicio también es público, pero pasa por acá: con sesión del estudio muestra el panel (app/page.tsx),
// y la sesión tiene que llegar renovada, porque desde la página no se pueden guardar las cookies nuevas.
const PUBLIC = new Set(["/privacidad", "/auth/callback", "/api/visits", "/api/sugerencias"]);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.has(pathname) || !url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const session = await studioSession(supabase);
  const email = session?.email ?? null;
  if (session?.allowed || pathname === "/") return response;

  // Una cuenta de afuera que ya existía: se le cierra la sesión.
  if (email) await supabase.auth.signOut({ scope: "local" });

  let denied: NextResponse;
  if (pathname.startsWith("/api/")) {
    denied = NextResponse.json(
      { error: email ? "Esa cuenta no tiene acceso" : "Iniciá sesión con tu cuenta del estudio" },
      { status: email ? 403 : 401 }
    );
  } else {
    const home = new URL("/", request.url);
    home.searchParams.set("login", email ? "sin-acceso" : "requerido");
    if (!email) home.searchParams.set("next", pathname + search);
    denied = NextResponse.redirect(home);
  }
  // Lo que Supabase haya tocado en las cookies (renovar o borrar la sesión) viaja en la respuesta.
  response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
  return denied;
}

export const config = {
  // Todo menos archivos estáticos, íconos, librerías de /vendor e imágenes de emojis (públicas y muchas por página).
  matcher: ["/((?!_next/static|_next/image|__nextjs|favicon.ico|icon.png|apple-icon.png|vendor/|api/emojis/img).*)"],
};
