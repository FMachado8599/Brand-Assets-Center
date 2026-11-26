import https from "node:https";
import { BROWSER_UA } from "@/lib/downloads/http.server";
import { socialName, socialUrl, type BrandSocial, type SocialNetwork } from "./socials";

/**
 * La foto de perfil de una cuenta, sin iniciar sesión en ninguna red. Cada una la da distinto:
 *
 * - Instagram: la página "embed" del perfil (la misma vía que usa Descargas para los posteos) o, si la
 *   cuenta no deja insertarse, la vista previa de la página del perfil. Sin sesión la da a 100 px, y la
 *   URL viene firmada: no se puede pedir más grande.
 * - Facebook: la Graph API la da sin token para las páginas, al tamaño que se pida (720 px).
 * - YouTube: la página del canal la publica para las vistas previas de links (900 px).
 * - X y LinkedIn: la publican para las vistas previas de links, pero solo se la muestran a sus propios
 *   lectores de vistas previas (400 px en X, 200 px en LinkedIn).
 * - TikTok: la página "embed" del creador (100 px). La página del perfil la tapa un control antibots.
 */

export class AvatarError extends Error {
  constructor(
    message: string,
    public status = 502
  ) {
    super(message);
  }
}

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** De dónde puede venir la foto en cada red: lo que no sea su CDN no se baja (no somos un proxy abierto). */
const CDN: Record<SocialNetwork, RegExp> = {
  instagram: /(^|\.)(cdninstagram\.com|fbcdn\.net)$/,
  facebook: /(^|\.)fbcdn\.net$/,
  tiktok: /(^|\.)(tiktokcdn(-us|-eu)?\.com|ibyteimg\.com|byteimg\.com)$/,
  youtube: /(^|\.)(googleusercontent\.com|ggpht\.com)$/,
  x: /^pbs\.twimg\.com$/,
  linkedin: /^media\.licdn\.com$/,
};

const PREVIEW_BOT: Partial<Record<SocialNetwork, string>> = {
  instagram: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  x: "Twitterbot/1.0",
  linkedin: "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
};

export async function profilePicture(account: BrandSocial): Promise<{ bytes: ArrayBuffer; type: string }> {
  const src = await FINDERS[account.network](account);
  if (!src) throw notFound(account);

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    throw notFound(account);
  }
  if (url.protocol !== "https:" || !CDN[account.network].test(url.hostname)) throw notFound(account);

  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new AvatarError(`${socialName(account.network)} no dejó bajar la foto. Probá de nuevo en un rato.`);
  const type = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!TYPES.has(type)) {
    await res.body?.cancel();
    throw new AvatarError(`${socialName(account.network)} mandó algo que no es una imagen.`);
  }
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) throw new AvatarError("La foto pesa más de 5 MB.");
  return { bytes, type };
}

const FINDERS: Record<SocialNetwork, (account: BrandSocial) => Promise<string | null>> = {
  async instagram(account) {
    let embedError: unknown = null;
    try {
      const html = await navigate(`https://www.instagram.com/${account.handle}/embed/`, "instagram");
      const raw = html.match(/"contextJSON":("(?:[^"\\]|\\.)*"|null)/)?.[1];
      const ctx = raw && raw !== "null" ? (JSON.parse(JSON.parse(raw)) as { context?: { profile_pic_url?: string } } | null) : null;
      if (ctx?.context?.profile_pic_url) return ctx.context.profile_pic_url;
    } catch (err) {
      embedError = err;
    }
    // Las cuentas que apagaron "permitir insertar" (ej: changan.uy) devuelven el embed vacío. La página del
    // perfil igual publica la foto para las vistas previas de links; una cuenta que no existe no trae og:image.
    const html = await page(socialUrl(account), "instagram");
    const src = html && ogImage(html);
    if (src) return src;
    if (embedError) throw embedError;
    return null;
  },

  async facebook({ handle }) {
    const res = await fetch(`https://graph.facebook.com/${encodeURIComponent(handle)}/picture?width=720&height=720&redirect=false`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as { data?: { url?: string; is_silhouette?: boolean } } | null;
    // Una cuenta personal (o una página que no existe) responde con error; una sin foto, con la silueta.
    return json?.data?.url && !json.data.is_silhouette ? json.data.url : null;
  },

  async youtube(account) {
    const html = await page(socialUrl(account), "youtube");
    return html && ogImage(html);
  },

  async x(account) {
    const html = await page(socialUrl(account), "x");
    const src = html && ogImage(html);
    // Sin perfil (o sin foto), X publica su imagen genérica.
    if (!src || !src.includes("/profile_images/")) return null;
    return src.replace(/_(normal|bigger|200x200)\.(jpe?g|png|webp)$/i, "_400x400.$2");
  },

  async linkedin(account) {
    const html = await page(socialUrl(account), "linkedin");
    return html && ogImage(html);
  },

  async tiktok({ handle }) {
    const html = await page(`https://www.tiktok.com/embed/@${handle}`, "tiktok");
    const raw = html?.match(/"avatarThumbUrl":("(?:[^"\\]|\\.)*")/)?.[1];
    return raw ? (JSON.parse(raw) as string) : null;
  },
};

/** Una página común. null si la cuenta no existe (404, o el 400 de TikTok). */
async function page(url: string, network: SocialNetwork) {
  const res = await fetch(url, {
    headers: { "User-Agent": PREVIEW_BOT[network] ?? BROWSER_UA, "Accept-Language": "es-AR,es;q=0.9,en;q=0.8" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new AvatarError(`${socialName(network)} tardó demasiado en responder. Probá de nuevo.`, 504);
  });
  if (res.status === 404 || res.status === 400 || res.status === 410) return null;
  if (!res.ok) throw blocked(network, res.status);
  return res.text();
}

/**
 * Instagram solo sirve el embed si el pedido dice "Sec-Fetch-Mode: navigate", y el fetch() de Node lo fija
 * en "cors" sin dejar cambiarlo: por eso va con https (igual que en Descargas).
 */
function navigate(url: string, network: SocialNetwork) {
  return new Promise<string>((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
          "Sec-Fetch-Dest": "iframe",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "cross-site",
        },
        timeout: 10_000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(res.statusCode === 404 ? notFound({ network, handle: "" }) : blocked(network, res.statusCode ?? 0));
        }
        let html = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (html += chunk));
        res.on("end", () => resolve(html));
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new AvatarError(`${socialName(network)} tardó demasiado en responder. Probá de nuevo.`, 504)));
    req.on("error", reject);
  });
}

function ogImage(html: string) {
  const tag = html.match(/<meta[^>]+property="og:image"[^>]*>/)?.[0];
  const content = tag?.match(/content="([^"]+)"/)?.[1];
  return content ? content.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/") : null;
}

function notFound(account: BrandSocial) {
  return new AvatarError(
    account.network === "facebook"
      ? "No encontramos esa página de Facebook (o es un perfil personal, que Facebook no deja leer)."
      : `No encontramos esa cuenta en ${socialName(account.network)} (o no tiene foto de perfil).`,
    404
  );
}

function blocked(network: SocialNetwork, status: number) {
  // Cuando desconfían de quien pregunta, las redes redirigen al login o responden "demasiados pedidos".
  const name = socialName(network);
  if (status >= 300 && status < 400) return new AvatarError(`${name} no dejó leer la cuenta (pidió iniciar sesión). Probá de nuevo en un rato.`);
  if (status === 429 || status === 503) return new AvatarError(`${name} está frenando los pedidos. Probá de nuevo en un rato.`, 503);
  return new AvatarError(`${name} respondió ${status}. Probá de nuevo en un rato.`);
}
