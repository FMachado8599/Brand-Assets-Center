import type { SupabaseClient } from "@supabase/supabase-js";
import { SLACK_SCOPES } from "@/lib/slack/config";
import { createSupabaseAnon } from "@/lib/supabase-server";
import { decrypt, hasSecret } from "./crypto";
import { llaveServidor } from "./llave-servidor";
import { leerConexion } from "./store";

/**
 * El bot de Slack del estudio. Una sola conexión para todos: la hace un admin desde Ajustes → Slack
 * (OAuth v2) y el token del bot queda cifrado en integraciones. Los tokens de bot de Slack no vencen
 * (salvo que se active la rotación en la app de Slack, que no usamos).
 *
 * Con sesión (un admin configurando, alguien avisando al equipo de una marca) se lee la conexión con la
 * sesión; sin sesión (la tarea de la mañana, los avisos de Basecamp, la página del cliente) con la llave
 * del servidor (slack_conexion_servidor, supabase/migracion-slack.sql).
 */

export const hasSlackEnv = () => Boolean(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en las variables del servidor`);
  return v;
}

export function slackRedirectUri(origin: string) {
  return process.env.SLACK_REDIRECT_URI || `${origin}/api/auth/slack/callback`;
}

export function slackAuthorizeUrl(origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: env("SLACK_CLIENT_ID"),
    scope: SLACK_SCOPES.join(","),
    redirect_uri: slackRedirectUri(origin),
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params}`;
}

export type SlackOAuth = {
  ok: boolean;
  error?: string;
  access_token: string;
  bot_user_id?: string;
  scope?: string;
  team?: { id: string; name: string };
  authed_user?: { id: string };
};

export async function slackExchangeCode(origin: string, code: string): Promise<SlackOAuth> {
  const r = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("SLACK_CLIENT_ID"),
      client_secret: env("SLACK_CLIENT_SECRET"),
      code,
      redirect_uri: slackRedirectUri(origin),
    }),
    cache: "no-store",
  });
  const body = (await r.json().catch(() => ({}))) as SlackOAuth;
  if (!r.ok || !body.ok) throw new Error(`Slack no autorizó la conexión: ${body.error ?? r.status}`);
  return body;
}

/** Lo que se guarda de la conexión (integraciones.datos) además del token. */
export type SlackDatos = {
  team_id?: string;
  team_nombre?: string;
  /** "camaratbwa" → camaratbwa.slack.com (para los links). */
  dominio?: string | null;
  bot_id?: string | null;
  /** El canal del estudio, donde sale el aviso de los cumpleaños del día. */
  canal_estudio?: { id: string; nombre: string } | null;
};

export class SlackError extends Error {
  constructor(public codigo: string, metodo: string) {
    super(`Slack (${metodo}): ${mensajeError(codigo)}`);
  }
}

/** Los errores de Slack que se pueden ver, en palabras. */
function mensajeError(codigo: string) {
  switch (codigo) {
    case "invalid_auth":
    case "token_revoked":
    case "account_inactive":
    case "not_authed":
      return "la conexión ya no sirve. Volvé a conectar Slack (lo hace un admin).";
    case "missing_scope":
      return "le falta un permiso al bot. Volvé a conectar Slack para darle los permisos nuevos.";
    case "name_taken":
      return "ya hay un canal con ese nombre";
    case "invalid_name_specials":
    case "invalid_name":
    case "invalid_name_punctuation":
    case "invalid_name_maxlength":
    case "invalid_name_required":
      return "ese nombre de canal no sirve (minúsculas, números y guiones, hasta 80)";
    case "channel_not_found":
      return "no se encontró el canal";
    case "is_archived":
      return "el canal está archivado";
    case "not_in_channel":
      return "el bot no está en ese canal";
    case "ratelimited":
      return "demasiados pedidos seguidos, probá en un rato";
    default:
      return codigo;
  }
}

export type SlackUsuario = { id: string; nombre: string; email: string | null };
export type SlackCanal = { id: string; nombre: string; miembros: number; es_miembro: boolean };
export type SlackBlock = Record<string, unknown>;
export type SlackMensaje = { text: string; blocks?: SlackBlock[] };

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Slack {
  constructor(
    private token: string,
    public datos: SlackDatos = {}
  ) {}

  /** Con la sesión de quien pide (un admin configurando, alguien avisando a su equipo). */
  static async desde(db: SupabaseClient) {
    const c = await leerConexion(db, "slack");
    if (!c) return null;
    return new Slack(c.accessToken, (c.datos ?? {}) as SlackDatos);
  }

  /** Sin sesión, con la llave del servidor. null si no hay conexión o la llave no está anotada. */
  static async desdeServidor() {
    if (!hasSecret()) return null;
    const { data, error } = await createSupabaseAnon().rpc("slack_conexion_servidor", { p_llave: llaveServidor("slack") });
    if (error || !data) return null;
    const fila = data as { access_token: string; datos: SlackDatos | null };
    try {
      return new Slack(decrypt(fila.access_token), fila.datos ?? {});
    } catch {
      return null;
    }
  }

  /**
   * Un método de la API. Todo va como formulario (lo aceptan todos los métodos); los bloques viajan
   * como JSON. Si Slack frena por cantidad de pedidos, se espera lo que pide (hasta 3 s) y se reintenta una vez.
   */
  async api<T = Record<string, unknown>>(metodo: string, params: Record<string, unknown> = {}, intento = 0): Promise<T> {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      body.set(k, typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    const r = await fetch(`https://slack.com/api/${metodo}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (r.status === 429 && intento === 0) {
      const segundos = Math.min(Number(r.headers.get("retry-after")) || 1, 3);
      await espera(segundos * 1000);
      return this.api<T>(metodo, params, 1);
    }
    const json = (await r.json().catch(() => ({ ok: false, error: `http_${r.status}` }))) as { ok: boolean; error?: string } & T;
    if (!json.ok) throw new SlackError(json.error ?? "error", metodo);
    return json;
  }

  /** La gente del Slack (sin bots ni cuentas borradas), con su mail. */
  async usuarios(): Promise<SlackUsuario[]> {
    type Miembro = {
      id: string;
      deleted?: boolean;
      is_bot?: boolean;
      is_app_user?: boolean;
      name?: string;
      real_name?: string;
      profile?: { email?: string; display_name?: string; real_name?: string };
    };
    const out: SlackUsuario[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const r = await this.api<{ members: Miembro[]; response_metadata?: { next_cursor?: string } }>("users.list", { limit: 200, cursor });
      for (const m of r.members) {
        if (m.deleted || m.is_bot || m.is_app_user || m.id === "USLACKBOT") continue;
        out.push({
          id: m.id,
          nombre: m.profile?.display_name || m.profile?.real_name || m.real_name || m.name || m.id,
          email: m.profile?.email?.toLowerCase() ?? null,
        });
      }
      cursor = r.response_metadata?.next_cursor || undefined;
      if (!cursor) break;
    }
    return out;
  }

  /** Los canales públicos (sin los archivados). */
  async canales(): Promise<SlackCanal[]> {
    type Canal = { id: string; name: string; num_members?: number; is_member?: boolean };
    const out: SlackCanal[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const r = await this.api<{ channels: Canal[]; response_metadata?: { next_cursor?: string } }>("conversations.list", {
        types: "public_channel",
        exclude_archived: true,
        limit: 1000,
        cursor,
      });
      for (const c of r.channels) out.push({ id: c.id, nombre: c.name, miembros: c.num_members ?? 0, es_miembro: Boolean(c.is_member) });
      cursor = r.response_metadata?.next_cursor || undefined;
      if (!cursor) break;
    }
    return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  /** Crea un canal público. Si ya existe uno con ese nombre, devuelve ese. */
  async crearCanal(nombre: string): Promise<{ id: string; nombre: string; existia: boolean }> {
    try {
      const r = await this.api<{ channel: { id: string; name: string } }>("conversations.create", { name: nombre, is_private: false });
      return { id: r.channel.id, nombre: r.channel.name, existia: false };
    } catch (e) {
      if (e instanceof SlackError && e.codigo === "name_taken") {
        const existente = (await this.canales()).find((c) => c.nombre === nombre);
        if (existente) {
          await this.unirse(existente.id);
          return { id: existente.id, nombre: existente.nombre, existia: true };
        }
      }
      throw e;
    }
  }

  /** El bot se suma a un canal público (para poder invitar gente). Si ya está, no pasa nada. */
  async unirse(canal: string) {
    await this.api("conversations.join", { channel: canal });
  }

  /** Invita gente a un canal; los que ya están no cuentan como error. */
  async invitar(canal: string, usuarios: string[]) {
    const lista = [...new Set(usuarios)].filter(Boolean);
    if (!lista.length) return;
    try {
      await this.api("conversations.invite", { channel: canal, users: lista.join(","), force: true });
    } catch (e) {
      if (e instanceof SlackError && ["already_in_channel", "cant_invite_self"].includes(e.codigo)) return;
      throw e;
    }
  }

  /** Abre un privado con una persona (o un grupo de hasta 8) y devuelve su id. */
  async abrirPrivado(usuarios: string[]) {
    const r = await this.api<{ channel: { id: string } }>("conversations.open", { users: usuarios.join(",") });
    return r.channel.id;
  }

  async postear(canal: string, mensaje: SlackMensaje) {
    const r = await this.api<{ ts: string; channel: string }>("chat.postMessage", {
      channel: canal,
      text: mensaje.text,
      blocks: mensaje.blocks,
      unfurl_links: false,
      unfurl_media: false,
    });
    return r;
  }

  /** El privado ya abierto con cada persona (para no abrirlo de nuevo en cada mensaje de la misma vuelta). */
  private privados = new Map<string, string>();

  /** Un privado a una persona. */
  async privado(usuario: string, mensaje: SlackMensaje) {
    let canal = this.privados.get(usuario);
    if (!canal) {
      canal = await this.abrirPrivado([usuario]);
      this.privados.set(usuario, canal);
    }
    return this.postear(canal, mensaje);
  }

  async team() {
    const r = await this.api<{ team: { id: string; name: string; domain?: string } }>("team.info");
    return r.team;
  }
}

/** "Café Changan & Co." → "cafe-changan-co": un nombre de canal válido para Slack. */
export function nombreDeCanal(texto: string) {
  return (
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "marca"
  );
}

/** Lo que se pone en un texto de Slack: &, < y > se escapan (si no, Slack los toma como links o menciones). */
export const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Un link en el texto de Slack. */
export const link = (url: string, texto: string) => `<${url.replace(/[<>|]/g, "")}|${esc(texto).replace(/\|/g, "¦")}>`;
