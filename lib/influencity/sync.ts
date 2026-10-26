import type { SupabaseClient } from "@supabase/supabase-js";
import { fold } from "@/lib/redaccion/text";
import { InfluencityError, type ApiPerfil, type ApiPublicacion, type ApiTracking, type Influencity } from "./api";
import type { Cuotas } from "./tipos";

/**
 * Sincronización con Influencity, en pasos cortos como la de Basecamp: cada pedido al servidor hace
 * uno (o un pedazo de uno) y dice cuál sigue, así nunca pasa el límite de una función de Vercel.
 *
 *  trackings      → todas las campañas que mide Influencity. Las que no tienen cliente elegido a
 *                   mano toman el que aparezca en su nombre ("Verano UTE" → UTE).
 *  publicaciones  → las publicaciones de cada campaña, con sus métricas y sus perfiles. Las
 *                   terminadas hace más de 14 días y ya leídas no se vuelven a pedir (con `completa`, sí).
 *  perfiles       → el detalle de cada perfil nuevo o leído hace más de 7 días (seguidores,
 *                   audiencia, precio estimado…).
 *  cierre         → lo que queda del plan (cuotas) y a qué cliente va cada publicación.
 */

export type SyncPaso = "trackings" | "publicaciones" | "perfiles" | "cierre" | "listo";

export type SyncResumen = {
  inicio?: string;
  completa?: boolean;
  trackings?: number;
  publicaciones?: number;
  perfiles?: number;
  perfilesSinDatos?: number;
  /** Cuántas publicaciones cambiaron de cliente al cerrar. */
  asignadas?: number;
  requests?: number;
  /** El plan no incluye Content Tracking / perfiles (la API respondió 403). */
  sinTracking?: boolean;
  sinPerfiles?: boolean;
  /** Mientras se leen las publicaciones en varios pedidos: qué campañas faltan y por dónde va. */
  pendientes?: string[] | null;
  cursor?: { i: number; page: number } | null;
};

export type SyncRespuesta = { paso: SyncPaso; siguiente: SyncPaso; detalle: string; resumen: SyncResumen };

/** Margen de tiempo por pedido (las funciones de Vercel cortan a los 60 s). */
const PRESUPUESTO_MS = 38_000;
const RELEER_PERFIL_DIAS = 7;
const RELEER_TERMINADA_DIAS = 14;
const DIA = 86_400_000;

const sinPlan = (e: unknown) => e instanceof InfluencityError && e.status === 403;

async function guardarResumen(db: SupabaseClient, resumen: SyncResumen, extra: Record<string, unknown> = {}) {
  const { error } = await db
    .from("inf_sync")
    .upsert({ id: "influencity", resumen, corriendo_desde: new Date().toISOString(), ...extra });
  if (error) throw new Error(error.message);
}

async function leerResumen(db: SupabaseClient): Promise<SyncResumen> {
  const { data, error } = await db.from("inf_sync").select("resumen").eq("id", "influencity").maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.resumen as SyncResumen) ?? {};
}

function check<T extends { error: { message: string } | null }>(r: T) {
  if (r.error) throw new Error(r.error.message);
  return r;
}

/* ───────────── De la API a las filas ───────────── */

const entero = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null);
const decimal = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
const sinArroba = (s: string) => s.trim().replace(/^@/, "").toLowerCase();

export function filaPublicacion(p: ApiPublicacion, trackingId: string | null) {
  const perfiles = (p.profiles ?? []).filter((x) => x.profileId);
  const trackings = new Set((p.contentTrackings ?? []).map((t) => t.contentTrackingId).filter(Boolean));
  if (trackingId) trackings.add(trackingId);
  const menciones = new Set([...(p.mentions ?? []), ...(p.tags ?? []), ...(p.collaborators ?? [])].map(sinArroba).filter(Boolean));
  const suma = [p.likes, p.comments, p.shares, p.saves].filter((n): n is number => typeof n === "number");
  return {
    id: p.publicationId,
    red: p.network ?? perfiles[0]?.socialNetwork ?? null,
    tipo: p.type ?? null,
    url: p.url ?? null,
    imagen: p.image ?? p.media?.[0] ?? null,
    texto: p.caption ?? p.title ?? null,
    fecha: p.publicationDate ?? null,
    perfil_id: perfiles[0]?.profileId ?? null,
    perfiles: perfiles.map((x) => x.profileId),
    trackings: [...trackings],
    grupos_cliente: (p.brandClients ?? []).map((g) => g.brandClientId).filter(Boolean),
    grupos_campana: (p.campaignsV3 ?? []).map((g) => g.campaignId).filter(Boolean),
    menciones: [...menciones],
    views: entero(p.views),
    likes: entero(p.likes),
    comentarios: entero(p.comments),
    compartidos: entero(p.shares),
    guardados: entero(p.saves),
    impresiones: entero(p.impressions),
    alcance: entero(p.accountsReached),
    interacciones: entero(p.totalInteractions) ?? (suma.length ? Math.round(suma.reduce((a, b) => a + b, 0)) : null),
    engagement: decimal(p.engagement),
    patrocinada: p.partnershipLabelAndAds === "sponsored" ? true : p.partnershipLabelAndAds === "notCommercial" ? false : null,
    estado_red: p.socialNetworkStatus ?? null,
    datos: p,
    actualizada: p.lastUpdate ?? null,
    sincronizada: new Date().toISOString(),
  };
}

/** Engagement del perfil en %: (likes + comentarios promedio) / seguidores. Sin datos, null. */
function engagementDe(a: ApiPerfil) {
  const seguidores = Number(a.followerCount);
  const likes = Number(a.avgLikes ?? 0);
  const comentarios = Number(a.avgComments ?? 0);
  if (!seguidores || !(likes + comentarios)) return null;
  return Math.round(((likes + comentarios) / seguidores) * 10_000) / 100;
}

export function filaPerfil(a: ApiPerfil) {
  return {
    id: a.profileId,
    red: a.socialNetwork,
    usuario: a.username,
    nombre: typeof a.fullName === "string" && a.fullName.trim() ? a.fullName.trim() : null,
    url: a.url ?? null,
    verificado: typeof a.isVerified === "boolean" ? a.isVerified : null,
    seguidores: entero(a.followerCount),
    engagement: engagementDe(a),
    pais: typeof a.country === "string" ? a.country : null,
    tipo_cuenta: typeof a.accountType === "string" ? a.accountType : null,
    estado: a.status ?? null,
    analizando: Boolean(a.isAnalyzing),
    detalle: a,
    detalle_leido: new Date().toISOString(),
    detalle_error: null,
    actualizado_en_influencity: a.lastUpdatedAt ?? null,
    sincronizado: new Date().toISOString(),
    ...(a.profilePhotoUrl ? { foto_url: a.profilePhotoUrl } : {}),
  };
}

/** Guarda (o actualiza) un perfil con todo su detalle. */
export async function guardarPerfil(db: SupabaseClient, a: ApiPerfil) {
  check(await db.from("inf_perfiles").upsert(filaPerfil(a)));
}

/** Guarda las publicaciones de una página: primero sus perfiles y grupos (por las referencias). */
export async function guardarPublicaciones(db: SupabaseClient, pubs: ApiPublicacion[], trackingId: string | null) {
  if (!pubs.length) return;
  const perfiles = new Map<string, { id: string; red: string; usuario: string; foto_url: string | null; verificado: boolean | null }>();
  const grupos = new Map<string, { tipo: "cliente" | "campana"; id: string; nombre: string | null }>();
  for (const p of pubs) {
    for (const x of p.profiles ?? []) {
      if (!x.profileId || perfiles.has(x.profileId)) continue;
      perfiles.set(x.profileId, {
        id: x.profileId,
        red: x.socialNetwork ?? p.network ?? "instagram",
        usuario: x.username ?? x.profileId,
        foto_url: x.picture ?? null,
        verificado: typeof x.isVerified === "boolean" ? x.isVerified : null,
      });
    }
    for (const g of p.brandClients ?? []) if (g.brandClientId) grupos.set(`cliente:${g.brandClientId}`, { tipo: "cliente", id: g.brandClientId, nombre: g.name ?? null });
    for (const g of p.campaignsV3 ?? []) if (g.campaignId) grupos.set(`campana:${g.campaignId}`, { tipo: "campana", id: g.campaignId, nombre: g.name ?? null });
  }
  // Los perfiles nuevos se crean con lo poco que trae la publicación; el detalle lo completa el paso perfiles.
  if (perfiles.size) check(await db.from("inf_perfiles").upsert([...perfiles.values()], { onConflict: "id", ignoreDuplicates: true }));
  if (grupos.size) check(await db.from("inf_grupos").upsert([...grupos.values()], { onConflict: "tipo,id" }));
  check(await db.from("inf_publicaciones").upsert(pubs.map((p) => filaPublicacion(p, trackingId))));
}

/* ───────────── Cliente por nombre ───────────── */

type Marca = { id: string; name: string; socials?: { network: string; handle: string }[] | null };

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * El cliente que aparece en un nombre ("Día de la Madre · UTE" → UTE, "@forduruguay verano" → Ford).
 * Gana el nombre más largo (así "Ford Ranger" le gana a "Ford"). Nombres de menos de 3 letras no.
 */
export function clienteEnNombre(nombre: string, marcas: Marca[]) {
  const texto = ` ${fold(nombre).replace(/[^\p{L}\p{N}@._]+/gu, " ")} `;
  let mejor: { id: string; largo: number } | null = null;
  for (const m of marcas) {
    const candidatos = [fold(m.name), ...(m.socials ?? []).map((s) => fold(s.handle))].filter((c) => c.length >= 3);
    for (const c of candidatos) {
      const re = new RegExp(`[\\s@]${escapar(c)}(?=[\\s.,_]|$)`, "u");
      if (re.test(texto) && (!mejor || c.length > mejor.largo)) mejor = { id: m.id, largo: c.length };
    }
  }
  return mejor?.id ?? null;
}

async function marcas(db: SupabaseClient): Promise<Marca[]> {
  const conSocials = await db.from("brands").select("id, name, socials");
  if (!conSocials.error) return (conSocials.data ?? []) as Marca[];
  // Sin migracion-redes.sql no hay socials: alcanza con el nombre.
  const { data } = check(await db.from("brands").select("id, name"));
  return (data ?? []) as Marca[];
}

/* ───────────── Pasos ───────────── */

/** Todas las campañas de Influencity a la tabla. También lo usan las acciones (pausar, crear…). */
export async function sincronizarTrackings(api: Influencity, db: SupabaseClient) {
  const todos: ApiTracking[] = [];
  for (let page = 1; page < 200; page++) {
    const r = await api.trackings(page);
    todos.push(...r.data);
    if (!r.data.length || page >= r.pagination.totalPages) break;
  }
  const ahora = new Date().toISOString();
  if (todos.length) {
    check(
      await db.from("inf_trackings").upsert(
        todos.map((t) => ({
          id: t.trackingId,
          nombre: t.name,
          estado: t.status?.toLowerCase() ?? null,
          tipo: t.type ?? null,
          inicio: t.startDate || null,
          fin: t.endDate || null,
          origen: t.createdFrom ?? null,
          en_influencity: true,
          sincronizado: ahora,
        }))
      )
    );
  }

  // Las que ya no están en Influencity quedan como registro.
  const { data: guardados } = check(await db.from("inf_trackings").select("id, nombre, brand_id, brand_manual, en_influencity"));
  const vivos = new Set(todos.map((t) => t.trackingId));
  const idas = (guardados ?? []).filter((t) => t.en_influencity && !vivos.has(t.id)).map((t) => t.id as string);
  if (idas.length) check(await db.from("inf_trackings").update({ en_influencity: false }).in("id", idas));

  // Cliente por nombre en las que no se eligió a mano.
  const lista = await marcas(db);
  const cambios = (guardados ?? [])
    .filter((t) => !t.brand_manual)
    .map((t) => ({ id: t.id as string, nombre: t.nombre as string, antes: t.brand_id as string | null, brand_id: clienteEnNombre(t.nombre as string, lista) }))
    .filter((t) => t.brand_id !== t.antes);
  if (cambios.length) check(await db.from("inf_trackings").upsert(cambios.map(({ id, nombre, brand_id }) => ({ id, nombre, brand_id }))));
  return todos.length;
}

async function pasoTrackings(api: Influencity, db: SupabaseClient, completa: boolean): Promise<SyncRespuesta> {
  const resumen: SyncResumen = { inicio: new Date().toISOString(), completa, pendientes: null, cursor: null };
  try {
    resumen.trackings = await sincronizarTrackings(api, db);
  } catch (e) {
    if (!sinPlan(e)) throw e;
    resumen.sinTracking = true;
  }
  resumen.requests = api.requests;
  await guardarResumen(db, resumen);
  return {
    paso: "trackings",
    siguiente: resumen.sinTracking ? "perfiles" : "publicaciones",
    detalle: resumen.sinTracking ? "El plan no incluye Content Tracking" : `${resumen.trackings} campañas`,
    resumen,
  };
}

async function pasoPublicaciones(api: Influencity, db: SupabaseClient): Promise<SyncRespuesta> {
  const t0 = Date.now();
  const resumen = await leerResumen(db);
  let pendientes = resumen.pendientes;
  if (!pendientes) {
    const { data } = check(await db.from("inf_trackings").select("id, estado, fin, leido").eq("en_influencity", true).order("id"));
    pendientes = (data ?? [])
      .filter((t) => {
        if (resumen.completa || !t.leido || !t.fin) return true;
        const estado = String(t.estado ?? "").toLowerCase();
        if (estado === "active" || estado === "paused") return true;
        // Terminada: se relee hasta 14 días después del fin (las métricas siguen subiendo un tiempo).
        return new Date(t.leido as string).getTime() < new Date(t.fin as string).getTime() + RELEER_TERMINADA_DIAS * DIA;
      })
      .map((t) => t.id as string);
    resumen.cursor = { i: 0, page: 1 };
  }
  let { i, page } = resumen.cursor ?? { i: 0, page: 1 };
  let leidas = 0;

  while (i < pendientes.length && Date.now() - t0 < PRESUPUESTO_MS) {
    const id = pendientes[i];
    let r;
    try {
      r = await api.publicaciones(id, page);
    } catch (e) {
      // Una campaña que ya no existe (404) no frena al resto.
      if (e instanceof InfluencityError && e.status === 404) {
        i++;
        page = 1;
        continue;
      }
      throw e;
    }
    await guardarPublicaciones(db, r.data, id);
    leidas += r.data.length;
    if (!r.data.length || page >= r.pagination.totalPages) {
      check(await db.from("inf_trackings").update({ publicaciones: r.pagination.total, leido: new Date().toISOString() }).eq("id", id));
      i++;
      page = 1;
    } else page++;
  }

  const listo = i >= pendientes.length;
  resumen.publicaciones = (resumen.publicaciones ?? 0) + leidas;
  resumen.pendientes = listo ? null : pendientes;
  resumen.cursor = listo ? null : { i, page };
  resumen.requests = (resumen.requests ?? 0) + api.requests;
  await guardarResumen(db, resumen);
  return {
    paso: "publicaciones",
    siguiente: listo ? "perfiles" : "publicaciones",
    detalle: pendientes.length ? `${Math.min(i, pendientes.length)} de ${pendientes.length} campañas · ${resumen.publicaciones} publicaciones` : "Nada nuevo",
    resumen,
  };
}

async function pasoPerfiles(api: Influencity, db: SupabaseClient): Promise<SyncRespuesta> {
  const t0 = Date.now();
  const resumen = await leerResumen(db);
  const desde = resumen.completa && resumen.inicio ? resumen.inicio : new Date(Date.now() - RELEER_PERFIL_DIAS * DIA).toISOString();
  const { data } = check(
    await db
      .from("inf_perfiles")
      .select("id")
      .or(`detalle_leido.is.null,detalle_leido.lt."${desde}"`)
      .order("detalle_leido", { ascending: true, nullsFirst: true })
      .limit(300)
  );
  const cola = (data ?? []).map((p) => p.id as string);
  let hechos = 0;
  let sinDatos = 0;
  let cortado = false;

  // De a 4 a la vez: el límite de velocidad lo pone el cliente de la API.
  const trabajar = async () => {
    for (;;) {
      if (cortado || Date.now() - t0 > PRESUPUESTO_MS) return;
      const id = cola.shift();
      if (!id) return;
      try {
        await guardarPerfil(db, await api.perfil(id));
        hechos++;
      } catch (e) {
        if (sinPlan(e)) {
          cortado = true;
          resumen.sinPerfiles = true;
          return;
        }
        // No es de la cuenta (404) u otro error: queda anotado y se reintenta en 7 días.
        const motivo = e instanceof InfluencityError && e.status === 404 ? "no_encontrado" : (e as Error).message.slice(0, 200);
        check(await db.from("inf_perfiles").update({ detalle_leido: new Date().toISOString(), detalle_error: motivo }).eq("id", id));
        sinDatos++;
      }
    }
  };
  await Promise.all([trabajar(), trabajar(), trabajar(), trabajar()]);

  resumen.perfiles = (resumen.perfiles ?? 0) + hechos;
  resumen.perfilesSinDatos = (resumen.perfilesSinDatos ?? 0) + sinDatos;
  resumen.requests = (resumen.requests ?? 0) + api.requests;
  await guardarResumen(db, resumen);
  const quedan = !cortado && (cola.length > 0 || (data ?? []).length === 300);
  return {
    paso: "perfiles",
    siguiente: quedan ? "perfiles" : "cierre",
    detalle: resumen.sinPerfiles ? "El plan no incluye perfiles" : `${resumen.perfiles} perfiles al día`,
    resumen,
  };
}

/** Lo que queda del plan. Si una de las dos no está en el plan, queda null. */
export async function leerCuotas(api: Influencity): Promise<Cuotas> {
  const [t, a] = await Promise.allSettled([api.cuotaTracking(), api.cuotaPerfiles()]);
  return {
    tracking: t.status === "fulfilled" ? { restantes: t.value.remainingProfilesInTracking, limite: t.value.profilesLimit } : null,
    analisis: a.status === "fulfilled" ? { restantes: a.value.remainingAnalysisPerPeriod, limite: a.value.analysisLimitPerPeriod } : null,
    leidas: new Date().toISOString(),
  };
}

/** Clientes y campañas de Influencity sin cliente elegido a mano: por nombre. */
async function asignarGrupos(db: SupabaseClient) {
  const { data } = check(await db.from("inf_grupos").select("tipo, id, nombre, brand_id").eq("brand_manual", false));
  if (!data?.length) return;
  const lista = await marcas(db);
  const cambios = data
    .map((g) => ({ tipo: g.tipo, id: g.id, nombre: g.nombre, antes: g.brand_id, brand_id: g.nombre ? clienteEnNombre(g.nombre, lista) : null }))
    .filter((g) => g.brand_id !== g.antes)
    .map(({ tipo, id, nombre, brand_id }) => ({ tipo, id, nombre, brand_id }));
  if (cambios.length) check(await db.from("inf_grupos").upsert(cambios, { onConflict: "tipo,id" }));
}

async function pasoCierre(api: Influencity, db: SupabaseClient): Promise<SyncRespuesta> {
  const resumen = await leerResumen(db);
  const cuotas = await leerCuotas(api);
  await asignarGrupos(db);
  const { data: asignadas, error } = await db.rpc("inf_resolver_clientes");
  if (error) throw new Error(error.message);
  resumen.asignadas = Number(asignadas) || 0;
  resumen.requests = (resumen.requests ?? 0) + api.requests;
  resumen.pendientes = null;
  resumen.cursor = null;
  check(
    await db.from("inf_sync").upsert({
      id: "influencity",
      resumen,
      cuotas,
      ultimo: new Date().toISOString(),
      ultimo_error: null,
      corriendo_desde: null,
    })
  );
  return { paso: "cierre", siguiente: "listo", detalle: "Listo", resumen };
}

export async function correrPaso(api: Influencity, db: SupabaseClient, paso: SyncPaso, opts: { completa: boolean }): Promise<SyncRespuesta> {
  switch (paso) {
    case "trackings":
      return pasoTrackings(api, db, opts.completa);
    case "publicaciones":
      return pasoPublicaciones(api, db);
    case "perfiles":
      return pasoPerfiles(api, db);
    case "cierre":
      return pasoCierre(api, db);
    default:
      return { paso, siguiente: "listo", detalle: "Listo", resumen: {} };
  }
}

/** Si un paso falla: queda anotado y se libera el turno. */
export async function anotarError(db: SupabaseClient, mensaje: string) {
  await db.from("inf_sync").upsert({ id: "influencity", ultimo_error: mensaje.slice(0, 500), corriendo_desde: null });
}
