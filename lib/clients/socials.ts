/**
 * Las cuentas de redes de un cliente. Se guardan como { red, usuario } y el link se arma acá: así un
 * mismo usuario escrito de cinco formas distintas (con @, con el link entero, con /?hl=es…) queda igual.
 * Sin nada de Node ni del navegador: lo usan la ficha y la ruta que trae la foto de perfil.
 */

export type SocialNetwork = "instagram" | "tiktok" | "facebook" | "youtube" | "x" | "linkedin";

export type BrandSocial = { network: SocialNetwork; handle: string };

export const SOCIAL_NETWORKS: { id: SocialNetwork; name: string }[] = [
  { id: "instagram", name: "Instagram" },
  { id: "tiktok", name: "TikTok" },
  { id: "facebook", name: "Facebook" },
  { id: "youtube", name: "YouTube" },
  { id: "x", name: "X" },
  { id: "linkedin", name: "LinkedIn" },
];

export const socialName = (network: SocialNetwork) => SOCIAL_NETWORKS.find((n) => n.id === network)?.name ?? network;

/**
 * Cómo es un usuario válido en cada red. YouTube y LinkedIn guardan también la parte de la ruta cuando
 * no es la de siempre (channel/UC…, c/nombre, school/…), por eso aceptan una barra.
 */
const HANDLE: Record<SocialNetwork, RegExp> = {
  instagram: /^[a-z0-9._]{1,30}$/i,
  tiktok: /^[a-z0-9._]{2,24}$/i,
  facebook: /^[a-z0-9.-]{3,80}$/i,
  youtube: /^(?:[a-z0-9._-]{3,30}|channel\/UC[a-z0-9_-]{22}|(?:c|user)\/[a-z0-9._-]{1,100})$/i,
  x: /^[a-z0-9_]{1,15}$/i,
  linkedin: /^(?:[a-z0-9-_%.]{2,100}|(?:school|showcase)\/[a-z0-9-_%.]{2,100})$/i,
};

const BASE: Record<SocialNetwork, string> = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/@",
  facebook: "https://www.facebook.com/",
  youtube: "https://www.youtube.com/",
  x: "https://x.com/",
  linkedin: "https://www.linkedin.com/",
};

export const isValidHandle = (network: SocialNetwork, handle: string) => HANDLE[network].test(handle);

/** El link al perfil. */
export function socialUrl({ network, handle }: BrandSocial) {
  if (network === "youtube") return BASE.youtube + (handle.includes("/") ? handle : `@${handle}`);
  if (network === "linkedin") return BASE.linkedin + (handle.includes("/") ? handle : `company/${handle}`);
  return BASE[network] + handle;
}

/** Cómo se muestra: @usuario donde la red usa @; el nombre de la página donde no. */
export function socialLabel({ network, handle }: BrandSocial) {
  if (network === "facebook" || network === "linkedin") return handle.split("/").pop()!;
  if (network === "youtube" && handle.includes("/")) return handle.split("/").pop()!;
  return `@${handle}`;
}

/** Identifica a una cuenta (ej: "instagram:camaratbwa"); es lo que queda anotado cuando su foto es el logo. */
export const socialKey = ({ network, handle }: BrandSocial) => `${network}:${handle.toLowerCase()}`;

const HOSTS: [RegExp, SocialNetwork][] = [
  [/(^|\.)(instagram\.com|instagr\.am)$/, "instagram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)youtube\.com$/, "youtube"],
  [/(^|\.)(x\.com|twitter\.com)$/, "x"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
];

/** Partes de la ruta que no son una cuenta (instagram.com/p/…, facebook.com/watch…). */
const NOT_ACCOUNTS = /^(p|reel|reels|tv|stories|explore|watch|share|groups|events|hashtag|search|home|i|intent|video|shorts|playlist|results|feed|login)$/i;

/**
 * Lo que se escribió o pegó, como cuenta: un link a un perfil (la red sale del link) o un usuario
 * suelto con o sin @ (la red es `fallback`). null si no se entiende o el usuario no es válido.
 */
export function parseSocial(input: string, fallback: SocialNetwork): BrandSocial | null {
  const text = input.trim();
  if (!text) return null;

  const looksLikeLink = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}\//i.test(text) || /^(https?:\/\/)?([a-z0-9-]+\.)*(instagram|tiktok|facebook|youtube|x|twitter|linkedin)\.com\/?$/i.test(text);
  if (!looksLikeLink) {
    const handle = text.replace(/^@/, "");
    return isValidHandle(fallback, handle) ? { network: fallback, handle } : null;
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const network = HOSTS.find(([re]) => re.test(host))?.[1];
  if (!network) return null;
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const first = parts[0] ?? "";

  let handle = "";
  if (network === "facebook" && first === "profile.php") handle = url.searchParams.get("id") ?? "";
  else if (network === "facebook" && first === "pages") handle = parts.find((p) => /^\d{5,}$/.test(p)) ?? "";
  else if (network === "youtube") {
    if (first.startsWith("@")) handle = first.slice(1);
    else if (["channel", "c", "user"].includes(first) && parts[1]) handle = `${first}/${parts[1]}`;
  } else if (network === "linkedin") {
    if (first === "company" && parts[1]) handle = parts[1];
    else if ((first === "school" || first === "showcase") && parts[1]) handle = `${first}/${parts[1]}`;
  } else if (!NOT_ACCOUNTS.test(first)) handle = first.replace(/^@/, "");

  return handle && isValidHandle(network, handle) ? { network, handle } : null;
}

/** Normaliza lo que viene de la base (jsonb: puede venir cualquier cosa). Saca repetidas e inválidas. */
export function cleanSocials(raw: unknown): BrandSocial[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BrandSocial[] = [];
  for (const item of raw) {
    const network = (item as BrandSocial)?.network;
    const handle = (item as BrandSocial)?.handle;
    if (!SOCIAL_NETWORKS.some((n) => n.id === network) || typeof handle !== "string" || !isValidHandle(network, handle)) continue;
    const key = socialKey({ network, handle });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ network, handle });
  }
  return out;
}
