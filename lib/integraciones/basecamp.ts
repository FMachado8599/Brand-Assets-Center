import type { SupabaseClient } from "@supabase/supabase-js";
import { leerConexion, renovarTokens, type Conexion } from "./store";

/**
 * Basecamp (bc3): login de 37signals (Launchpad) y un cliente de la API con los cuidados que ya
 * se probaron en el panel de STATUS: User-Agent obligatorio, máximo 50 pedidos cada 10 s
 * (se usan 45), reintento en 429 respetando Retry-After y paginación por el header Link.
 */

const LAUNCHPAD = "https://launchpad.37signals.com";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en las variables del servidor`);
  return v;
}

export const hasBasecampEnv = () => Boolean(process.env.BASECAMP_CLIENT_ID && process.env.BASECAMP_CLIENT_SECRET);

/** Basecamp exige identificarse: nombre de la app y un mail de contacto. */
const userAgent = () => process.env.BASECAMP_USER_AGENT || "Herramientas Camara TBWA (fmachado@camaratbwa.com)";

/** Tiene que coincidir EXACTO con el Redirect URI registrado en launchpad.37signals.com/integrations. */
export function basecampRedirectUri(origin: string) {
  return process.env.BASECAMP_REDIRECT_URI || `${origin}/api/auth/callback/basecamp`;
}

export function basecampAuthorizeUrl(origin: string, state: string) {
  // response_type es el formato estándar; type=web_server, el viejo que algunas cuentas todavía piden.
  const params = new URLSearchParams({
    response_type: "code",
    type: "web_server",
    client_id: env("BASECAMP_CLIENT_ID"),
    redirect_uri: basecampRedirectUri(origin),
    state,
  });
  return `${LAUNCHPAD}/authorization/new?${params}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

async function postToken(params: Record<string, string>) {
  return fetch(`${LAUNCHPAD}/authorization/token?${new URLSearchParams(params)}`, {
    method: "POST",
    headers: { "User-Agent": userAgent() },
    cache: "no-store",
  });
}

/** Algunas cuentas todavía piden el formato viejo (type=web_server): se prueba el estándar y si no, el viejo. */
export async function basecampExchangeCode(origin: string, code: string): Promise<TokenResponse> {
  const shared = {
    client_id: env("BASECAMP_CLIENT_ID"),
    client_secret: env("BASECAMP_CLIENT_SECRET"),
    redirect_uri: basecampRedirectUri(origin),
    code,
  };
  const modern = await postToken({ grant_type: "authorization_code", ...shared });
  if (modern.ok) return modern.json();
  const legacy = await postToken({ type: "web_server", ...shared });
  if (!legacy.ok) throw new Error(`Basecamp no aceptó el código (${legacy.status})`);
  return legacy.json();
}

async function refresh(refreshToken: string): Promise<TokenResponse> {
  const shared = {
    client_id: env("BASECAMP_CLIENT_ID"),
    client_secret: env("BASECAMP_CLIENT_SECRET"),
    refresh_token: refreshToken,
  };
  const modern = await postToken({ grant_type: "refresh_token", ...shared });
  if (modern.ok) return modern.json();
  const legacy = await postToken({ type: "refresh", ...shared });
  if (!legacy.ok) throw new Error(`No se pudo renovar el acceso a Basecamp (${legacy.status}). Hay que volver a conectarlo.`);
  return legacy.json();
}

export type BasecampIdentity = {
  identity: { id: number; first_name: string; last_name: string; email_address: string };
  accounts: { id: number; name: string; product: string; href: string; app_href: string }[];
};

export async function basecampIdentity(accessToken: string): Promise<BasecampIdentity> {
  const r = await fetch(`${LAUNCHPAD}/authorization.json`, {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": userAgent() },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Basecamp no devolvió la cuenta (${r.status})`);
  return r.json();
}

/** Los tokens de Basecamp duran 2 semanas. */
export const expiraDesde = (expiresIn?: number) => new Date(Date.now() + (expiresIn ?? 14 * 86400) * 1000);

/* ───────────── Cliente de la API ───────────── */

const WINDOW_MS = 10_000;
const MAX_REQUESTS = 45;

/**
 * Un cliente por pedido al servidor: lleva su propio límite de velocidad y renueva el token
 * (y lo guarda) si venció en el medio.
 */
export class Basecamp {
  private stamps: number[] = [];
  requests = 0;

  constructor(
    private db: SupabaseClient,
    private conexion: Conexion
  ) {}

  static async desde(db: SupabaseClient) {
    const conexion = await leerConexion(db, "basecamp");
    if (!conexion) return null;
    const bc = new Basecamp(db, conexion);
    // Se renueva un día antes de que venza.
    if (conexion.expira && conexion.expira.getTime() - Date.now() < 86_400_000) await bc.renovar();
    return bc;
  }

  get accountId() {
    return this.conexion.cuenta_id ?? "";
  }

  base() {
    // BASECAMP_API_URL solo para probar contra una API simulada; en producción no se define.
    return `${process.env.BASECAMP_API_URL || "https://3.basecampapi.com"}/${this.accountId}`;
  }

  private async renovar() {
    if (!this.conexion.refreshToken) throw new Error("La conexión con Basecamp venció. Hay que volver a conectarla.");
    const t = await refresh(this.conexion.refreshToken);
    const expira = expiraDesde(t.expires_in);
    this.conexion = { ...this.conexion, accessToken: t.access_token, refreshToken: t.refresh_token ?? this.conexion.refreshToken, expira };
    await renovarTokens(this.db, "basecamp", { accessToken: t.access_token, refreshToken: t.refresh_token, expira });
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    while (this.stamps.length && now - this.stamps[0] > WINDOW_MS) this.stamps.shift();
    if (this.stamps.length >= MAX_REQUESTS) {
      await new Promise((r) => setTimeout(r, WINDOW_MS - (now - this.stamps[0]) + 50));
      return this.throttle();
    }
    this.stamps.push(now);
  }

  private async get(url: string, retried = false): Promise<Response> {
    await this.throttle();
    this.requests++;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${this.conexion.accessToken}`, "User-Agent": userAgent() },
      cache: "no-store",
    });
    if (r.status === 429) {
      const wait = Number(r.headers.get("Retry-After") ?? "10");
      await new Promise((res) => setTimeout(res, Math.min(wait, 30) * 1000));
      return this.get(url, retried);
    }
    if (r.status === 401 && !retried) {
      await this.renovar();
      return this.get(url, true);
    }
    if (!r.ok) throw new Error(`Basecamp respondió ${r.status} en ${url.replace(this.base(), "")}`);
    return r;
  }

  async one<T>(url: string): Promise<T> {
    return (await this.get(url)).json();
  }

  /** Todas las páginas, siguiendo el header Link (las páginas crecen: 15, 30, 50, 100). */
  async all<T>(url: string): Promise<T[]> {
    return (await this.until<T>(url, () => false)).items;
  }

  /**
   * Páginas hasta que `stop` diga basta (para listas ordenadas por fecha: se corta al llegar a lo
   * ya visto) o hasta `deadline`. `complete` dice si se llegó al final; si no, `next` es la página
   * por la que seguir.
   */
  async until<T>(
    url: string,
    stop: (item: T) => boolean,
    deadline?: number
  ): Promise<{ items: T[]; complete: boolean; next: string | null }> {
    const items: T[] = [];
    let next: string | null = url;
    while (next) {
      const r = await this.get(next);
      const body = (await r.json()) as T[];
      for (const item of body) {
        if (stop(item)) return { items, complete: true, next: null };
        items.push(item);
      }
      const match = /<([^>]+)>;\s*rel="next"/.exec(r.headers.get("Link") ?? "");
      next = match ? match[1] : null;
      // Se corta entre páginas: `next` es por dónde seguir en el próximo pedido.
      if (next && deadline && Date.now() > deadline) return { items, complete: false, next };
    }
    return { items, complete: true, next: null };
  }
}
