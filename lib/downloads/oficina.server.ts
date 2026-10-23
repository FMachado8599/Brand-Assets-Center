import { isIP } from "node:net";
import { announcement } from "./youtube.server";

/**
 * Si un pedido viene de la red de la oficina: compara la IP de quien pide con la IP pública de la
 * oficina. Esa la anota el servicio de YouTube (corre en una PC de la oficina) junto con su dirección; también
 * se puede fijar en OFICINA_IPS (separadas por coma). La IP de quien pide no se guarda: solo el sí o el no.
 *
 * IPv4 se compara entera (toda la oficina sale por la misma); IPv6, por la red (los primeros 64 bits),
 * porque ahí cada compu tiene su propia dirección.
 */
export async function desdeOficina(req: Request): Promise<boolean | null> {
  const ip = clientIp(req);
  if (!ip) return null;
  // En local (la app corriendo en una compu de la oficina) el pedido llega de la misma red.
  if (isPrivate(ip)) return true;

  const fixed = (process.env.OFICINA_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const announced = await announcement().catch(() => null);
  const office = [...fixed, announced?.oficina?.v4, announced?.oficina?.v6].filter((s): s is string => !!s && isIP(s) > 0);
  if (!office.length) return null;
  return office.some((o) => sameNetwork(ip, o));
}

function clientIp(req: Request) {
  // En Vercel, x-forwarded-for la pone la plataforma (la primera es la de quien pide).
  const raw = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip")?.trim() || "";
  const ip = raw.replace(/^::ffff:/i, "");
  return isIP(ip) ? ip : null;
}

function isPrivate(ip: string) {
  if (isIP(ip) === 4) return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80:/i.test(ip);
}

function sameNetwork(a: string, b: string) {
  const kind = isIP(a);
  if (kind !== isIP(b)) return false;
  if (kind === 4) return a === b;
  return expand(a).slice(0, 4).join(":") === expand(b).slice(0, 4).join(":");
}

/** "2803:9800::1" → los 8 grupos completos, para comparar el prefijo. */
function expand(ip: string) {
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const middle = ip.includes("::") ? Array(8 - left.length - right.length).fill("0") : [];
  return [...left, ...middle, ...right].map((g) => g.padStart(4, "0"));
}
