/**
 * Links firmados a /api/retoque/archivo. El resultado de Magnific se baja a través de este servidor (no se
 * sabe si su CDN habilita CORS, y la página lo necesita en memoria para copiarlo o ponerlo en un ZIP), pero
 * esa ruta no puede ser un proxy abierto: solo baja URLs que firmó /api/retoque/fondo, y por pocos minutos.
 *
 * Usa Web Crypto, así anda igual en Node (fondo) y en edge (archivo). La clave es la de Magnific: si se
 * cambia, los links que estaban dando vueltas dejan de valer.
 */

const encoder = new TextEncoder();

/** Magnific deja los resultados 5 minutos: el link no tiene sentido después. */
const TTL_SECONDS = 5 * 60;

function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", encoder.encode(`retoque:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function toBase64Url(bytes: Uint8Array) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** La ruta (relativa) por la que la página baja el resultado. */
export async function signedFilePath(url: string, secret: string) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(`${exp}.${url}`));
  const params = new URLSearchParams({ u: url, e: String(exp), s: toBase64Url(new Uint8Array(sig)) });
  return `/api/retoque/archivo?${params}`;
}

export type Verdict = "ok" | "expired" | "invalid";

/** Comprueba la firma (en tiempo constante, con verify) y que no haya vencido. */
export async function verifyFile(url: string, exp: number, sig: string, secret: string): Promise<Verdict> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromBase64Url(sig);
  } catch {
    return "invalid";
  }
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), bytes, encoder.encode(`${exp}.${url}`));
  if (!ok) return "invalid";
  return exp < Date.now() / 1000 ? "expired" : "ok";
}
