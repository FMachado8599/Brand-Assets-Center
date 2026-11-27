import { NextResponse, type NextRequest } from "next/server";
import { InfluencityError, type ApiPerfilNuevo } from "@/lib/influencity/api";
import { conInfluencity } from "@/lib/influencity/ruta";
import { guardarPerfil } from "@/lib/influencity/sync";
import { limpiarUsuario, REDES_INFLUENCITY, type RedInfluencity } from "@/lib/influencity/tipos";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const esRed = (r: unknown): r is RedInfluencity => REDES_INFLUENCITY.includes(r as RedInfluencity);

/** Buscar un perfil que ya está en el IRM de Influencity (por red y usuario). */
export async function GET(request: NextRequest) {
  const red = request.nextUrl.searchParams.get("red");
  const usuario = limpiarUsuario(request.nextUrl.searchParams.get("usuario") ?? "");
  if (!esRed(red) || !usuario) return NextResponse.json({ error: "Falta la red o el usuario" }, { status: 400 });
  return conInfluencity(async (api, db) => {
    try {
      const p = await api.perfilPorUsuario(red, usuario);
      await guardarPerfil(db, p);
      return { perfil: p.profileId };
    } catch (e) {
      if (e instanceof InfluencityError && e.status === 404) return { perfil: null };
      throw e;
    }
  });
}

/**
 * Agregar un influencer a Influencity (si ya estaba, se usa ese) y traer su detalle. `analizar`
 * pide además el análisis de audiencia (gasta una de las cuotas del período). Con `brand_id` queda
 * anotado que trabajó con ese cliente.
 */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as { red?: string; usuario?: string; analizar?: boolean; brand_id?: string | null; nota?: string };
  const usuario = limpiarUsuario(b.usuario ?? "");
  if (!esRed(b.red) || !usuario) return NextResponse.json({ error: "Falta la red o el usuario" }, { status: 400 });
  const red = b.red;
  const brand = b.brand_id && UUID.test(b.brand_id) ? b.brand_id : null;

  return conInfluencity(async (api, db) => {
    let nuevo: ApiPerfilNuevo | null = null;
    let id: string;
    try {
      nuevo = await api.agregarPerfil(red, b.usuario!.trim(), b.analizar === true);
      id = nuevo.profileId;
    } catch (e) {
      // Ya estaba en Influencity: viene su id en el error.
      const existente = e instanceof InfluencityError && e.status === 409 ? e.details?.profileId : null;
      if (typeof existente !== "string") throw e;
      id = existente;
      if (b.analizar) await api.analizar(id).catch(() => null);
    }

    try {
      await guardarPerfil(db, await api.perfil(id));
    } catch (e) {
      if (!nuevo) throw e;
      // Recién creado puede tardar en aparecer: se guarda lo que devolvió la creación.
      const { error } = await db.from("inf_perfiles").upsert({
        id,
        red: nuevo.socialNetwork,
        usuario: nuevo.username,
        url: nuevo.url,
        estado: nuevo.status ?? null,
        analizando: Boolean(nuevo.isAnalyzing),
      });
      if (error) throw new Error(error.message);
    }

    if (brand) {
      const { error } = await db
        .from("inf_vinculos")
        .upsert({ perfil_id: id, tipo: "cliente", ref: brand, brand_id: brand, nota: b.nota?.trim() || null }, { onConflict: "perfil_id,tipo,ref" });
      if (error) throw new Error(error.message);
    }
    return { perfil: id, yaEstaba: !nuevo };
  });
}
