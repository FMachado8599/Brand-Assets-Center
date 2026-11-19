import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { hash, verify, type Options } from "@node-rs/argon2";

/**
 * Las contraseñas de Herramientas (supabase/migracion-acceso-contrasena.sql), siguiendo OWASP:
 *
 *  1. La contraseña se normaliza (Unicode NFKC, como pide NIST) y se le aplica un HMAC-SHA-256 con el
 *     pepper. El pepper es un secreto compartido que vive en las variables de entorno (PASSWORD_PEPPER),
 *     nunca en la base ni en el código: si alguien se lleva la base, los hashes no le sirven sin él.
 *  2. Ese HMAC pasa por Argon2id: 64 MiB de memoria, 3 pasadas, paralelismo 1, salt aleatorio de 16
 *     bytes (crypto.randomBytes, uno distinto por contraseña) y 32 bytes de salida.
 *  3. Se guarda solo el resultado en formato PHC ($argon2id$v=19$m=65536,t=3,p=1$<salt>$<hash>), que
 *     ya incluye el salt y los parámetros para verificarla. La contraseña nunca se guarda ni se loguea.
 *
 * Nada de esto se escribe a mano: Argon2id es @node-rs/argon2 (mantenida, con la comparación en tiempo
 * constante adentro) y el HMAC, node:crypto.
 */

export const ARGON2 = {
  memoryCost: 64 * 1024, // KiB → 64 MiB
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
  saltBytes: 16,
} as const;

/** Argon2id (el const enum de la librería no se puede importar con isolatedModules). */
const ARGON2ID = 2 as unknown as NonNullable<Options["algorithm"]>;

export const LARGO_MINIMO = 12;
export const LARGO_MAXIMO = 128;
/** Más que esto ni se intenta verificar: evita que una contraseña gigante cueste CPU (DoS). */
const LARGO_TOPE_VERIFICAR = 1024;

export const PEPPER_VERSION = Number(process.env.PASSWORD_PEPPER_VERSION || 1);

function pepper(): Buffer {
  const raw = process.env.PASSWORD_PEPPER;
  if (!raw) throw new Error("Falta PASSWORD_PEPPER");
  // Se acepta en base64 (como lo genera `openssl rand -base64 32`) o como texto largo.
  const b = /^[A-Za-z0-9+/=_-]{43,}$/.test(raw) ? Buffer.from(raw, "base64") : Buffer.from(raw, "utf8");
  if (b.length < 32) throw new Error("PASSWORD_PEPPER tiene que tener al menos 32 bytes");
  return b;
}

export const hayPepper = () => {
  try {
    pepper();
    return true;
  } catch {
    return false;
  }
};

/**
 * HMAC-SHA-256(pepper, contraseña normalizada): lo que entra a Argon2id. En base64: la librería lee la
 * entrada como texto al verificar y los 32 bytes crudos no siempre son UTF-8 válido.
 */
function conPepper(contrasena: string): string {
  return createHmac("sha256", pepper()).update(contrasena.normalize("NFKC"), "utf8").digest("base64");
}

export async function hashear(contrasena: string): Promise<string> {
  return hash(conPepper(contrasena), {
    algorithm: ARGON2ID,
    memoryCost: ARGON2.memoryCost,
    timeCost: ARGON2.timeCost,
    parallelism: ARGON2.parallelism,
    outputLen: ARGON2.outputLen,
    salt: randomBytes(ARGON2.saltBytes),
  });
}

/** Un hash de relleno: si el mail no tiene contraseña igual se verifica algo, y la respuesta tarda lo mismo. */
let relleno: Promise<string> | null = null;
const hashDeRelleno = () => (relleno ??= hashear(randomBytes(32).toString("base64url")));

/**
 * ¿La contraseña es la de ese hash? Con `hashGuardado` null verifica contra el relleno (y da false),
 * así no se puede saber por el tiempo de respuesta si un mail tiene cuenta.
 */
export async function verificar(hashGuardado: string | null, contrasena: string): Promise<boolean> {
  if (typeof contrasena !== "string" || !contrasena || contrasena.length > LARGO_TOPE_VERIFICAR) {
    await verify(await hashDeRelleno(), conPepper("relleno")).catch(() => false);
    return false;
  }
  const objetivo = hashGuardado ?? (await hashDeRelleno());
  let ok = false;
  try {
    ok = await verify(objetivo, conPepper(contrasena));
  } catch {
    ok = false;
  }
  return ok && hashGuardado !== null;
}

/** Si el hash se hizo con parámetros más débiles que los de ahora (o con otro pepper), conviene rehacerlo. */
export function hayQueRehashear(phc: string, pepperVersion: number) {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(phc);
  if (!m) return true;
  return Number(m[1]) < ARGON2.memoryCost || Number(m[2]) < ARGON2.timeCost || Number(m[3]) !== ARGON2.parallelism || pepperVersion !== PEPPER_VERSION;
}

/* ───────────── Política (OWASP / NIST 800-63B) ─────────────
   Largo mínimo 12 y máximo 128, cualquier carácter (espacios y emojis incluidos), sin reglas de
   "una mayúscula y un símbolo". Lo que sí se frena: contraseñas filtradas en brechas conocidas, o
   que contienen el propio mail. */

export function problemaDeContrasena(contrasena: unknown, email: string): string | null {
  if (typeof contrasena !== "string") return "Escribí una contraseña";
  const largo = [...contrasena.normalize("NFKC")].length;
  if (largo < LARGO_MINIMO) return `Tiene que tener al menos ${LARGO_MINIMO} caracteres`;
  if (largo > LARGO_MAXIMO) return `Puede tener hasta ${LARGO_MAXIMO} caracteres`;
  const usuario = email.split("@")[0]?.toLowerCase() ?? "";
  if (usuario.length >= 4 && contrasena.toLowerCase().includes(usuario)) return "No puede contener tu mail";
  if (/^(.)\1+$/.test(contrasena)) return "Es demasiado fácil de adivinar";
  return null;
}

/**
 * ¿Apareció en una brecha conocida? Usa Have I Been Pwned con k-anonimato: solo viajan los primeros
 * 5 caracteres del SHA-1, nunca la contraseña ni su hash entero. Si el servicio no responde, no frena.
 */
export async function estaFiltrada(contrasena: string): Promise<boolean> {
  const sha1 = createHash("sha1").update(contrasena, "utf8").digest("hex").toUpperCase();
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, {
      headers: { "Add-Padding": "true", "User-Agent": "Herramientas" },
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const resto = sha1.slice(5);
    return (await res.text()).split("\n").some((linea) => {
      const [sufijo, veces] = linea.trim().split(":");
      return sufijo === resto && Number(veces) > 0;
    });
  } catch {
    return false;
  }
}

/* ───────────── Links de un solo uso ───────────── */

/** Un link nuevo: 32 bytes aleatorios. En la base queda solo su SHA-256. */
export function nuevoToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashDeToken(token) };
}

export const hashDeToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

/**
 * Para las claves de los intentos: el mail o la IP nunca quedan en claro, y con un HMAC (no un SHA-256
 * pelado) ni siquiera con la tabla en la mano se puede probar mail por mail cuál es.
 */
export const huella = (texto: string) => createHmac("sha256", pepper()).update(`intentos:${texto}`, "utf8").digest("hex").slice(0, 40);
