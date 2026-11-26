import { NextResponse } from "next/server";
import { AvatarError, profilePicture } from "@/lib/clients/avatar.server";
import { isValidHandle, SOCIAL_NETWORKS, type SocialNetwork } from "@/lib/clients/socials";

// Instagram se lee con node:https (ver avatar.server.ts).
export const runtime = "nodejs";

/**
 * /api/clientes/foto?red=instagram&cuenta=camaratbwa → la foto de perfil de esa cuenta (la imagen).
 * La ficha la muestra para elegirla y, si se elige, la sube como logo del cliente: los links de las
 * redes vencen, así que el logo nunca apunta a ellas.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const network = params.get("red") as SocialNetwork;
  const handle = params.get("cuenta") ?? "";
  if (!SOCIAL_NETWORKS.some((n) => n.id === network) || !isValidHandle(network, handle)) {
    return NextResponse.json({ error: "Esa cuenta no es válida" }, { status: 400 });
  }

  try {
    const { bytes, type } = await profilePicture({ network, handle });
    return new Response(bytes, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(bytes.byteLength),
        // Se pide dos veces seguidas (para mostrarla y para subirla): la segunda sale del navegador.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    if (err instanceof AvatarError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[clientes/foto]", err);
    return NextResponse.json({ error: "No pude leer esa cuenta. Probá de nuevo en un rato." }, { status: 502 });
  }
}
