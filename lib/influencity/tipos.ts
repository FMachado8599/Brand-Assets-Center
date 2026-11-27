import type { SocialNetwork } from "@/lib/clients/socials";

/**
 * Lo que comparten el servidor y la app del módulo Influencers: las filas de las tablas inf_*
 * (supabase/migracion-influencers.sql), las redes y cómo se muestran los números.
 */

export const REDES_INFLUENCITY = [
  "instagram",
  "tiktok",
  "youtube",
  "twitter",
  "facebook",
  "twitch",
  "pinterest",
  "snapchat",
  "tumblr",
  "vk",
  "weibo",
  "douyin",
] as const;

export type RedInfluencity = (typeof REDES_INFLUENCITY)[number];

/**
 * Falta correr supabase/migracion-influencers.sql: la base dice que no existe una tabla o función
 * inf_*, o rechaza "influencity" como proveedor de integraciones.
 */
export const faltaMigracionInfluencers = (message: string) =>
  /integraciones_proveedor/i.test(message) ||
  (/inf_/i.test(message) && /does not exist|schema cache|could not find|42P01|42883|PGRST20[25]/i.test(message));

/** Solo en estas Influencity analiza la audiencia. */
export const REDES_CON_ANALISIS: RedInfluencity[] = ["instagram", "tiktok", "youtube", "twitch"];

const NOMBRES: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X",
  facebook: "Facebook",
  twitch: "Twitch",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  tumblr: "Tumblr",
  vk: "VK",
  weibo: "Weibo",
  douyin: "Douyin",
};

export const nombreRed = (red: string | null | undefined) => (red ? NOMBRES[red] ?? red : "—");

/** La red de Influencity como la nombra la ficha del cliente (para el ícono). */
export function redSocial(red: string | null | undefined): SocialNetwork | null {
  if (red === "twitter") return "x";
  if (red === "instagram" || red === "tiktok" || red === "youtube" || red === "facebook") return red;
  return null;
}

/** Ejemplos: "@flor.uy", "https://www.instagram.com/flor.uy/", "instagram.com/flor.uy?hl=es". */
export function limpiarUsuario(raw: string) {
  const t = raw.trim();
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (/\.(com|tv|net)$/i.test(u.hostname) && u.pathname.length > 1) {
      const parte = u.pathname.split("/").filter(Boolean).find((p) => !["channel", "c", "user"].includes(p.toLowerCase()));
      if (parte) return parte.replace(/^@/, "");
    }
  } catch {
    /* no era un link */
  }
  return t.replace(/^@/, "").replace(/\/+$/, "");
}

/* ───────────── Filas ───────────── */

export type Perfil = {
  id: string;
  red: string;
  usuario: string;
  nombre: string | null;
  foto_url: string | null;
  url: string | null;
  verificado: boolean | null;
  seguidores: number | null;
  engagement: number | null;
  pais: string | null;
  tipo_cuenta: string | null;
  estado: string | null;
  analizando: boolean;
  detalle_leido: string | null;
  detalle_error: string | null;
  notas: string | null;
  creado: string;
  /** Si la cuenta es de un cliente (brands.socials), cuál: no cuenta como influencer. */
  cuenta_de: string | null;
};

export type Tracking = {
  id: string;
  nombre: string;
  estado: string | null;
  tipo: string | null;
  inicio: string | null;
  fin: string | null;
  origen: string | null;
  brand_id: string | null;
  brand_manual: boolean;
  publicaciones: number | null;
  leido: string | null;
  en_influencity: boolean;
};

export type Grupo = { tipo: "cliente" | "campana"; id: string; nombre: string | null; brand_id: string | null; brand_manual: boolean };

/** Una fila de la vista inf_rendimiento: un influencer, un cliente, un mes y una red. */
export type Rendimiento = {
  perfil_id: string;
  brand_id: string | null;
  mes: string | null;
  red: string | null;
  principal: boolean;
  publicaciones: number;
  views: number;
  likes: number;
  comentarios: number;
  compartidos: number;
  guardados: number;
  impresiones: number;
  alcance: number;
  interacciones: number;
  engagement_suma: number;
  engagement_n: number;
  patrocinadas: number;
  primera: string | null;
  ultima: string | null;
};

export type Publicacion = {
  id: string;
  red: string | null;
  tipo: string | null;
  url: string | null;
  imagen: string | null;
  texto: string | null;
  fecha: string | null;
  perfil_id: string | null;
  perfiles: string[];
  trackings: string[];
  views: number | null;
  likes: number | null;
  comentarios: number | null;
  compartidos: number | null;
  guardados: number | null;
  impresiones: number | null;
  alcance: number | null;
  interacciones: number | null;
  engagement: number | null;
  patrocinada: boolean | null;
  estado_red: string | null;
  brand_id: string | null;
  brand_origen: string | null;
  brand_manual: boolean;
};

export const COLUMNAS_PUBLICACION =
  "id, red, tipo, url, imagen, texto, fecha, perfil_id, perfiles, trackings, views, likes, comentarios, compartidos, guardados, impresiones, alcance, interacciones, engagement, patrocinada, estado_red, brand_id, brand_origen, brand_manual";

export type Vinculo = {
  id: string;
  perfil_id: string;
  /** cliente · plani · pieza · tarea… */
  tipo: string;
  ref: string;
  brand_id: string | null;
  titulo: string | null;
  href: string | null;
  nota: string | null;
  creado_por: string | null;
  creado: string;
};

export type Cuotas = {
  /** Lugares para perfiles en trackings activos (null = sin límite). */
  tracking: { restantes: number | null; limite: number | null } | null;
  /** Análisis de audiencia en el período (null = sin límite). */
  analisis: { restantes: number | null; limite: number | null } | null;
  leidas: string;
};

/* ───────────── Cómo se muestra ───────────── */

const compacto = new Intl.NumberFormat("es-UY", { notation: "compact", maximumFractionDigits: 1 });
const entero = new Intl.NumberFormat("es-UY");

/** 12.400 → "12,4 mil". */
export const corto = (n: number | null | undefined) => (n == null ? "—" : n >= 10_000 ? compacto.format(n) : entero.format(Math.round(n)));
export const numero = (n: number | null | undefined) => (n == null ? "—" : entero.format(Math.round(n)));
export const porcentaje = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `${n.toLocaleString("es-UY", { maximumFractionDigits: n < 10 ? 2 : 1 })} %`;

export const fechaCorta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("es-UY", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** Un día de calendario (inicio y fin de una campaña): Influencity lo manda en UTC, se muestra ese día. */
export const fechaDia = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("es-UY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

export const mesLargo = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("es-UY", { month: "long", year: "numeric" });

const ESTADOS: Record<string, string> = { active: "Activa", paused: "Pausada", finished: "Terminada", pending: "Por empezar", scheduled: "Por empezar" };
export const estadoTracking = (estado: string | null) => (estado ? ESTADOS[estado.toLowerCase()] ?? estado : "—");
export const trackingActivo = (estado: string | null) => estado?.toLowerCase() === "active";
export const trackingPausado = (estado: string | null) => estado?.toLowerCase() === "paused";

/** Por qué una publicación quedó en un cliente. */
export const ORIGEN_CLIENTE: Record<string, string> = {
  manual: "elegido a mano",
  cliente: "cliente en Influencity",
  campana: "campaña de Influencity",
  tracking: "por la campaña",
  propia: "cuenta del cliente",
  mencion: "menciona al cliente",
};

const ANALISIS: Record<string, string> = {
  ok: "Audiencia analizada",
  update: "Actualizando audiencia",
  autoRefresh: "Actualizando audiencia",
  new: "Analizando audiencia",
  notAnalyzed: "Sin analizar",
  lessThan1000: "Menos de 1.000 seguidores",
  noAudienceDataAvailable: "Sin datos de audiencia",
  private: "Cuenta privada",
  notExists: "La cuenta no existe",
  ko: "No se pudo analizar",
  retry_later: "Reintentar más tarde",
  incompletedData: "Datos incompletos",
};
export const estadoAnalisis = (estado: string | null) => (estado ? ANALISIS[estado] ?? estado : "Sin analizar");
