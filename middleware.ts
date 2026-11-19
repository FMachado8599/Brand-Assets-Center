import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { studioSession } from "@/lib/access";

/**
 * Las herramientas son solo para el estudio: sin sesión de una cuenta permitida (@camaratbwa.com, los
 * dominios y mails que habilita un admin) las páginas mandan a Inicio a iniciar sesión y las APIs responden 401.
 * Los datos los protege la base (supabase/migracion-acceso.sql); esto evita pantallas vacías y
 * que las APIs pagas (Conversor, búsqueda de emojis) se usen de afuera.
 */
// /api/sugerencias es pública a propósito: "no puedo entrar" también hay que poder avisarlo (tiene su propio límite).
// /api/basecamp/webhook también: la llama Basecamp, sin sesión (se valida con la llave de la URL).
// Y el link para que un admin de Basecamp autorice la conexión sin entrar a la app: el link, la vuelta
// de Basecamp y la pantalla final (se validan con la llave del link; la vuelta sin link exige ser admin).
// Inicio también es público, pero pasa por acá: con sesión del estudio muestra el panel (app/page.tsx),
// y la sesión tiene que llegar renovada, porque desde la página no se pueden guardar las cookies nuevas.
// Entrar con mail y contraseña: la pantalla, crear la contraseña con un link y sus APIs (cada una frena
// la fuerza bruta y responde lo mismo tenga o no cuenta el mail).
const PUBLIC = new Set(["/privacidad", "/auth/callback", "/api/visits", "/api/sugerencias", "/api/basecamp/webhook",
  "/api/integraciones/basecamp/autorizar", "/api/auth/callback/basecamp", "/basecamp/autorizado",
  "/ingresar", "/contrasena", "/api/auth/contrasena/ingresar", "/api/auth/contrasena/pedir", "/api/auth/contrasena/crear"]);
// La plani compartida con un cliente (/p/<token>) y sus archivos: la llave es el link, no la sesión.
// La base valida el token en cada pedido (supabase/migracion-plani-cliente.sql).
const PUBLIC_PREFIXES = ["/p/", "/api/p/"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) || !url || !key) return NextResponse.next();

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
    // Sin sesión, a /ingresar (Google o mail y contraseña) y después vuelve a donde iba. Una cuenta sin
    // acceso, a Inicio con el aviso.
    const destino = new URL(email ? "/" : "/ingresar", request.url);
    if (email) destino.searchParams.set("login", "sin-acceso");
    else destino.searchParams.set("next", pathname + search);
    denied = NextResponse.redirect(destino);
  }
  // Lo que Supabase haya tocado en las cookies (renovar o borrar la sesión) viaja en la respuesta.
  response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
  return denied;
}

export const config = {
  // Todo menos archivos estáticos, íconos e imágenes de emojis (públicas y muchas por página).
  matcher: ["/((?!_next/static|_next/image|__nextjs|favicon.ico|icon.png|apple-icon.png|api/emojis/img).*)"],
};
