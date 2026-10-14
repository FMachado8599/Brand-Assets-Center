import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarDatos, leerConexion, renovarTokens, type Conexion } from "./store";

/**
 * El Drive del estudio: el material final de las planis vive ahí, en carpetas por cliente, plani y
 * día. Una sola cuenta conectada para todos (la conecta un admin desde la app). El permiso es
 * drive.file: la app solo ve las carpetas y archivos que creó ella, nada más del Drive.
 *
 * Los archivos se suben directo del navegador a Google (sesión de subida "resumable" que abre el
 * servidor): así los videos no pasan por Vercel, que corta los pedidos de más de 4,5 MB.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";

export const DRIVE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.file"];
export const ROOT_NAME = "Herramientas · Planificaciones";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en las variables del servidor`);
  return v;
}

export const hasGoogleEnv = () => Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);

export function googleRedirectUri(origin: string) {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${origin}/api/auth/google/callback`;
}

export function googleAuthorizeUrl(origin: string, state: string, loginHint?: string) {
  const params = new URLSearchParams({
    client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: DRIVE_SCOPES.join(" "),
    access_type: "offline",
    // consent: así Google siempre devuelve un refresh token (sin él, la conexión dura una hora).
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; id_token?: string; scope?: string };

async function token(params: Record<string, string>): Promise<TokenResponse> {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      ...params,
    }),
    cache: "no-store",
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google respondió ${r.status}: ${body.error_description || body.error || "sin detalle"}`);
  return body;
}

export const googleExchangeCode = (origin: string, code: string) =>
  token({ grant_type: "authorization_code", code, redirect_uri: googleRedirectUri(origin) });

/** El mail de la cuenta conectada, del id_token (viene firmado por Google en la misma respuesta). */
export function emailDeIdToken(idToken?: string) {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export const expiraEn = (seconds?: number) => new Date(Date.now() + (seconds ?? 3600) * 1000);

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  imageMediaMetadata?: { width?: number; height?: number };
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
};

export const FILE_FIELDS = "id,name,mimeType,size,thumbnailLink,webViewLink,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis)";

export class Drive {
  constructor(
    private db: SupabaseClient,
    private conexion: Conexion
  ) {}

  static async desde(db: SupabaseClient) {
    const conexion = await leerConexion(db, "google");
    if (!conexion) return null;
    return new Drive(db, conexion);
  }

  get email() {
    return this.conexion.cuenta_id;
  }

  get datos() {
    return this.conexion.datos;
  }

  /** Un access token vigente (dura una hora; se renueva con el refresh token). */
  async accessToken() {
    if (this.conexion.expira && this.conexion.expira.getTime() - Date.now() > 60_000) return this.conexion.accessToken;
    if (!this.conexion.refreshToken) throw new Error("La conexión con Google Drive venció. Hay que volver a conectarla.");
    const t = await token({ grant_type: "refresh_token", refresh_token: this.conexion.refreshToken });
    const expira = expiraEn(t.expires_in);
    this.conexion = { ...this.conexion, accessToken: t.access_token, expira };
    // Desde la página del cliente no hay sesión del estudio para guardarlo: se renueva igual y listo.
    await renovarTokens(this.db, "google", { accessToken: t.access_token, refreshToken: t.refresh_token, expira }).catch(() => undefined);
    return t.access_token;
  }

  async fetch(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await this.accessToken()}`);
    return fetch(url, { ...init, headers, cache: "no-store" });
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const r = await this.fetch(url, init);
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(`Drive respondió ${r.status}: ${body?.error?.message ?? "sin detalle"}`);
    }
    return r.json();
  }

  async file(id: string, fields = FILE_FIELDS) {
    return this.json<DriveFile>(`${API}/files/${encodeURIComponent(id)}?fields=${fields}&supportsAllDrives=true`);
  }

  async crearCarpeta(nombre: string, padre?: string) {
    return this.json<DriveFile>(`${API}/files?fields=id,name,webViewLink&supportsAllDrives=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: limpiarNombre(nombre), mimeType: FOLDER, ...(padre ? { parents: [padre] } : {}) }),
    });
  }

  /** La carpeta raíz de la app. Si alguien la borró (o se fue a la papelera), se crea otra. */
  async raiz() {
    const guardada = typeof this.conexion.datos.raiz === "string" ? this.conexion.datos.raiz : null;
    if (guardada) {
      const ok = await this.json<{ trashed?: boolean }>(`${API}/files/${guardada}?fields=trashed&supportsAllDrives=true`).then(
        (f) => !f.trashed,
        () => false
      );
      if (ok) return guardada;
    }
    const carpeta = await this.crearCarpeta(ROOT_NAME);
    const datos = { ...this.conexion.datos, raiz: carpeta.id, raiz_url: carpeta.webViewLink ?? null };
    this.conexion = { ...this.conexion, datos };
    await guardarDatos(this.db, "google", datos);
    // Las carpetas recordadas eran de la raíz anterior.
    await this.db.from("drive_carpetas").delete().neq("clave", "");
    return carpeta.id;
  }

  /**
   * Una carpeta por clave (ej: "cliente:<id>"), creada una sola vez y recordada en drive_carpetas.
   * Si se borró en Drive, se vuelve a crear.
   */
  async carpeta(clave: string, nombre: string, padre: string) {
    const { data } = await this.db.from("drive_carpetas").select("drive_id").eq("clave", clave).maybeSingle();
    if (data?.drive_id) {
      const vive = await this.json<{ trashed?: boolean }>(`${API}/files/${data.drive_id}?fields=trashed&supportsAllDrives=true`).then(
        (f) => !f.trashed,
        () => false
      );
      if (vive) return data.drive_id as string;
    }
    const nueva = await this.crearCarpeta(nombre, padre);
    await this.db.from("drive_carpetas").upsert({ clave, drive_id: nueva.id });
    return nueva.id;
  }

  /**
   * Abre una subida "resumable" y devuelve la URL a la que el navegador manda el archivo. El Origin
   * hace que Google acepte el PUT desde esa página (CORS).
   */
  async sesionDeSubida(input: { nombre: string; mime: string; tamano: number; carpeta: string; origin: string }) {
    const r = await this.fetch(`${UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=${FILE_FIELDS}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": input.mime || "application/octet-stream",
        "X-Upload-Content-Length": String(input.tamano),
        Origin: input.origin,
      },
      body: JSON.stringify({ name: limpiarNombre(input.nombre), parents: [input.carpeta] }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(`Drive no abrió la subida (${r.status}): ${body?.error?.message ?? "sin detalle"}`);
    }
    const url = r.headers.get("Location");
    if (!url) throw new Error("Drive no devolvió la URL de subida");
    return url;
  }

  async borrar(id: string) {
    // A la papelera, no borrado definitivo: se puede recuperar desde Drive.
    const r = await this.fetch(`${API}/files/${encodeURIComponent(id)}?supportsAllDrives=true`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
    if (!r.ok && r.status !== 404) throw new Error(`Drive no pudo mover el archivo a la papelera (${r.status})`);
  }

  /** El contenido del archivo, tal cual (con Range, para que los videos se puedan adelantar). */
  async contenido(id: string, range?: string | null) {
    return this.fetch(`${API}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {
      headers: range ? { Range: range } : {},
    });
  }
}

/** Drive acepta casi cualquier nombre, pero en Windows y al bajar un zip molestan estos caracteres. */
export function limpiarNombre(nombre: string) {
  return nombre.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 180) || "archivo";
}
