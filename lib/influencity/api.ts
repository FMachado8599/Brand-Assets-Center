import type { SupabaseClient } from "@supabase/supabase-js";
import { leerConexion } from "@/lib/integraciones/store";
import type { RedInfluencity } from "./tipos";

/**
 * Cliente de la API pública de Influencity (docs.influencity.com). Un token por organización, con
 * Authorization: Bearer. Límites (compartidos por todas las claves de la cuenta): 10 pedidos/s,
 * 100.000 por día; refrescar un tracking 1/s y agregar un perfil 2/s. Acá se usan 8/s y se
 * reintenta un 429 de velocidad respetando Retry-After. Solo corre en el servidor.
 */

const BASE = () => (process.env.INFLUENCITY_API_URL || "https://api.influencity.com").replace(/\/$/, "");
const POR_SEGUNDO = 8;

export class InfluencityError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string | null,
    public details: Record<string, unknown> | null = null
  ) {
    super(message);
  }
}

/** Lo que Influencity contesta, en palabras de la app. */
export function mensajeInfluencity(e: unknown) {
  if (!(e instanceof InfluencityError)) return (e as Error).message;
  switch (e.code) {
    case "UNAUTHORIZED":
      return "Influencity no aceptó el token. Revisá que esté bien copiado o generá uno nuevo.";
    case "FEATURE_NOT_ENABLED":
    case "FORBIDDEN":
      return "El plan de Influencity no incluye esto.";
    case "QUOTA_EXCEEDED":
      return "Se usaron los 100.000 pedidos del día a Influencity. Mañana se puede seguir.";
    case "RATE_LIMIT_EXCEEDED":
      return "Influencity pidió ir más despacio. Probá en un minuto.";
    case "CONTENT_TRACKING_NAME_DUPLICATED":
      return "Ya hay una campaña con ese nombre en Influencity.";
    case "CONTENT_TRACKING_PROFILES_LIMIT_EXCEEDED":
      return "No quedan lugares para perfiles en los trackings del plan.";
    case "CONTENT_TRACKING_PROFILE_DUPLICATED":
      return "Ese perfil ya tiene su tracking.";
    case "CONTENT_TRACKING_INACTIVE":
      return "La campaña ya terminó: no se le pueden sumar perfiles.";
    case "CONTENT_TRACKING_NOT_ACTIVE":
      return "Solo se pueden pausar campañas activas.";
    case "CONTENT_TRACKING_NOT_PAUSED":
      return "Solo se pueden reanudar campañas pausadas.";
    case "CONTENT_TRACKING_REFRESH_TOO_SOON": {
      const horas = Number(e.details?.hoursRemaining);
      return Number.isFinite(horas) && horas > 0
        ? `Influencity deja refrescar de nuevo en ${Math.ceil(horas)} h.`
        : "Todavía no se puede volver a refrescar esa campaña.";
    }
    case "CONTENT_TRACKING_REFRESH_NOT_ENABLED":
      return "El plan no incluye refrescar campañas a pedido.";
    case "CONTENT_TRACKING_REFRESH_NO_PROFILES":
      return "La campaña no tiene perfiles para refrescar.";
    case "IRM_PROFILE_NOT_EXISTS":
      return "Influencity no encontró ese perfil.";
    case "PROFILE_ANALYSIS_LIMIT_EXCEEDED":
      return "No quedan análisis de audiencia en este período del plan.";
    case "PROFILE_ANALYSIS_IN_PROGRESS":
      return "Influencity ya está analizando ese perfil.";
    case "PROFILE_NOT_ANALYZED":
      return "Ese perfil todavía no se analizó: primero hay que analizarlo.";
    case "IRM_PROFILE_BLOCKING_RELATION":
      return "Ese perfil está en campañas activas.";
    default:
      return e.message;
  }
}

/* ───────────── Lo que devuelve la API ───────────── */

export type Paginado<T> = { data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } };

export type ApiTracking = {
  trackingId: string;
  name: string;
  status: string;
  type: string;
  startDate: string;
  endDate?: string;
  createdFrom: string;
};

export type ApiPublicacion = {
  publicationId: string;
  network?: string;
  type?: string;
  url?: string;
  shortcode?: string;
  image?: string;
  media?: string[];
  caption?: string;
  title?: string;
  hashtags?: string[];
  mentions?: string[];
  tags?: string[];
  collaborators?: string[];
  partnershipLabelAndAds?: string;
  socialNetworkStatus?: string;
  internalStatus?: string;
  publicationDate?: string;
  lastUpdate?: string;
  likes?: number;
  views?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  engagement?: number;
  impressions?: number;
  totalInteractions?: number;
  accountsReached?: number;
  estimatedViews?: number;
  profiles?: { profileId: string; username?: string; socialNetwork?: string; picture?: string; isVerified?: boolean }[];
  contentTrackings?: { contentTrackingId: string; name?: string }[];
  campaignsV3?: { campaignId: string; name?: string }[];
  brandClients?: { brandClientId: string; name?: string }[];
  irmInfluencers?: { irmInfluencerId: string; alias?: string; picture?: string }[];
  [k: string]: unknown;
};

export type ApiPerfil = {
  profileId: string;
  username: string;
  socialNetwork: string;
  url: string;
  status: string;
  isAnalyzing: boolean;
  lastUpdatedAt: string | null;
  profilePhotoUrl?: string;
  followerCount?: number;
  fullName?: string;
  isVerified?: boolean;
  accountType?: string;
  country?: string;
  metrics?: Record<string, unknown> | null;
  [k: string]: unknown;
};

export type ApiPerfilNuevo = { profileId: string; username: string; socialNetwork: string; url: string; status?: string; isAnalyzing?: boolean };

export type CuotaTracking = { remainingProfilesInTracking: number | null; profilesLimit: number | null };
export type CuotaPerfiles = { remainingAnalysisPerPeriod: number | null; analysisLimitPerPeriod: number | null };

export type NuevoTracking = {
  name: string;
  description?: string;
  hashtags?: string[];
  mentions?: string[];
  keywords?: string[];
  profileIds?: string[];
  startDate: string;
  endDate: string;
};

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Un cliente por pedido al servidor: lleva su propio límite de velocidad y cuenta los pedidos. */
export class Influencity {
  private stamps: number[] = [];
  requests = 0;

  constructor(private token: string) {}

  /** Con el token guardado en integraciones (null si Influencity no está conectado). */
  static async desde(db: SupabaseClient) {
    const conexion = await leerConexion(db, "influencity");
    return conexion ? new Influencity(conexion.accessToken) : null;
  }

  private async turno() {
    for (;;) {
      const now = Date.now();
      this.stamps = this.stamps.filter((t) => now - t < 1000);
      if (this.stamps.length < POR_SEGUNDO) {
        this.stamps.push(now);
        return;
      }
      await espera(1000 - (now - this.stamps[0]) + 5);
    }
  }

  private async pedir<T>(method: "GET" | "POST" | "DELETE", path: string, opts: { query?: Record<string, string | number>; body?: unknown } = {}): Promise<T> {
    const url = new URL(BASE() + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));
    for (let intento = 0; ; intento++) {
      await this.turno();
      this.requests++;
      const r = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
      });
      if (r.ok) return (r.status === 204 ? null : await r.json()) as T;
      const body = (await r.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null;
      const code = body?.error?.code ?? null;
      // Un 429 de velocidad se reintenta (hasta 3 veces, si la espera es corta); la cuota del día no.
      if (r.status === 429 && code !== "QUOTA_EXCEEDED" && code !== "CONTENT_TRACKING_REFRESH_TOO_SOON" && intento < 3) {
        const retry = Number(r.headers.get("Retry-After"));
        const ms = Number.isFinite(retry) && retry > 0 ? retry * 1000 : 1000 * (intento + 1);
        if (ms <= 10_000) {
          await espera(ms);
          continue;
        }
      }
      if ((r.status === 502 || r.status === 503 || r.status === 504) && intento < 2) {
        await espera(800 * (intento + 1));
        continue;
      }
      throw new InfluencityError(body?.error?.message ?? `Influencity respondió ${r.status}`, r.status, code ?? (r.status === 401 ? "UNAUTHORIZED" : null), body?.error?.details ?? null);
    }
  }

  /* Content Tracking */

  trackings(page: number, limit = 100) {
    return this.pedir<Paginado<ApiTracking>>("GET", "/content-tracking/v1/trackings", {
      query: { page, limit, sortBy: "createdAt", sortOrder: "desc" },
    });
  }

  crearTracking(body: NuevoTracking) {
    return this.pedir<ApiTracking>("POST", "/content-tracking/v1/trackings", { body });
  }

  crearTrackingDePerfil(profileId: string) {
    return this.pedir<ApiTracking>("POST", "/content-tracking/v1/trackings/profile", { body: { profileId } });
  }

  agregarPerfiles(trackingId: string, profileIds: string[]) {
    return this.pedir<{ addedProfileIds: string[] }>("POST", `/content-tracking/v1/trackings/${trackingId}/profiles`, { body: { profileIds } });
  }

  quitarPerfiles(trackingId: string, profileIds: string[]) {
    return this.pedir<{ removedProfileIds: string[] }>("DELETE", `/content-tracking/v1/trackings/${trackingId}/profiles`, { body: { profileIds } });
  }

  pausar(trackingIds: string[]) {
    return this.pedir<{ pausedTrackingIds: string[] }>("POST", "/content-tracking/v1/trackings/pause", { body: { trackingIds } });
  }

  reanudar(trackingIds: string[]) {
    return this.pedir<{ resumedTrackingIds: string[] }>("POST", "/content-tracking/v1/trackings/resume", { body: { trackingIds } });
  }

  refrescar(trackingId: string) {
    return this.pedir<unknown>("POST", `/content-tracking/v1/trackings/${trackingId}/refresh`);
  }

  publicaciones(trackingId: string, page: number, limit = 100) {
    return this.pedir<Paginado<ApiPublicacion>>("GET", `/content-tracking/v1/trackings/${trackingId}/publications`, {
      query: { page, limit, sortBy: "publicationDate", sortOrder: "desc" },
    });
  }

  cuotaTracking() {
    return this.pedir<CuotaTracking>("GET", "/content-tracking/v1/trackings/quota");
  }

  /* Profiles */

  agregarPerfil(red: RedInfluencity, perfil: string, analizar: boolean) {
    return this.pedir<ApiPerfilNuevo>("POST", "/profiles/v1/profiles", { body: { socialNetwork: red, profile: perfil, analyze: analizar } });
  }

  perfil(profileId: string) {
    return this.pedir<ApiPerfil>("GET", `/profiles/v1/profiles/${profileId}`);
  }

  perfilPorUsuario(red: RedInfluencity, usuario: string) {
    return this.pedir<ApiPerfil>("GET", "/profiles/v1/profiles", { query: { socialNetwork: red, username: usuario } });
  }

  analizar(profileId: string) {
    return this.pedir<ApiPerfil | ApiPerfilNuevo>("POST", `/profiles/v1/profiles/${profileId}/analyze`);
  }

  refrescarPerfil(profileId: string) {
    return this.pedir<ApiPerfil | ApiPerfilNuevo>("POST", `/profiles/v1/profiles/${profileId}/refresh`);
  }

  cuotaPerfiles() {
    return this.pedir<CuotaPerfiles>("GET", "/profiles/v1/profiles/quota");
  }
}
