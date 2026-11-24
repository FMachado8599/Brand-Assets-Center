import { llaveServidor } from "@/lib/integraciones/llave-servidor";
import { borrarEntrada, guardarEntrada, hashCodigo, leerEntrada, mandarCodigo, nuevaEntrada, nuevoCodigo, type PedidoOk } from "@/lib/plani/acceso.server";
import { mismoOrigen, responder, tokenValido } from "@/lib/plani/acceso-rutas.server";
import { createSupabaseAnon } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lo mismo para un mail habilitado o no: así no se puede averiguar qué mails entran. */
const ENVIADO = "Si ese mail está habilitado para esta presentación, te llegó un código. Revisá también el spam.";
const NO_SALIO = "No pudimos mandarte el código. Avisale a tu contacto en Cámara TBWA.";

type Cuerpo = { accion?: unknown; email?: unknown; codigo?: unknown };

/**
 * Entrar a una presentación compartida:
 *   { accion: "pedir", email }            → si el mail es del cliente, le llega un código.
 *   { accion: "canjear", email, codigo }  → con el código bien, este navegador queda habilitado 30 días.
 */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  if (!mismoOrigen(request)) return responder({ error: "Pedido de otro sitio" }, 403);
  if (!tokenValido(params.token)) return responder({ estado: "invalido" }, 404);
  const body = ((await request.json().catch(() => null)) ?? {}) as Cuerpo;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responder({ error: "Escribí tu mail" }, 400);

  const db = createSupabaseAnon();
  let llave: string;
  try {
    llave = llaveServidor("drive");
  } catch (e) {
    console.error("[p] entrar:", e);
    return responder({ error: NO_SALIO }, 503);
  }

  if (body.accion === "pedir") {
    const codigo = nuevoCodigo();
    const { data, error } = await db.rpc("presentacion_pedir_codigo", {
      p_llave: llave,
      p_token: params.token,
      p_email: email,
      p_codigo_hash: hashCodigo(params.token, email, codigo),
    });
    if (error) {
      console.error("[p] pedir código:", error.message);
      return responder({ error: NO_SALIO }, 503);
    }
    const r = data as { estado: string } | null;
    if (!r || r.estado === "invalido") return responder({ estado: "invalido" }, 404);
    if (r.estado === "espera") return responder({ error: "Pediste muchos códigos seguidos. Probá de nuevo en un rato." }, 429);
    if (r.estado === "no_habilitado") {
      // Tarda como si hubiera mandado el mail.
      await esperar(1200 + Math.random() * 1500);
      return responder({ ok: true, mensaje: ENVIADO });
    }
    if (r.estado === "sin_remitente") {
      console.warn("[p] quien compartió la presentación no tiene la casilla conectada");
      return responder({ error: NO_SALIO }, 503);
    }
    try {
      await mandarCodigo(r as PedidoOk, email, codigo);
    } catch (e) {
      console.error("[p] mandar código:", (e as Error).message);
      return responder({ error: NO_SALIO }, 502);
    }
    return responder({ ok: true, mensaje: ENVIADO });
  }

  if (body.accion === "canjear") {
    const codigo = typeof body.codigo === "string" ? body.codigo.replace(/\D/g, "") : "";
    if (codigo.length !== 6) return responder({ error: "El código tiene 6 números" }, 400);
    const entrada = nuevaEntrada();
    const { data, error } = await db.rpc("presentacion_canjear_codigo", {
      p_llave: llave,
      p_token: params.token,
      p_email: email,
      p_codigo_hash: hashCodigo(params.token, email, codigo),
      p_sesion_hash: entrada.hash,
    });
    if (error) {
      console.error("[p] canjear código:", error.message);
      return responder({ error: "No pudimos revisar el código. Probá de nuevo." }, 503);
    }
    const r = data as { estado: string; quedan?: number } | null;
    if (!r || r.estado === "invalido") return responder({ estado: "invalido" }, 404);
    if (r.estado === "ok") {
      guardarEntrada(params.token, entrada.sesion);
      return responder({ ok: true });
    }
    if (r.estado === "incorrecto") {
      const quedan = r.quedan ?? 0;
      return responder({ error: `Ese código no es. ${quedan === 1 ? "Te queda 1 intento." : `Te quedan ${quedan} intentos.`}` }, 400);
    }
    if (r.estado === "bloqueado") return responder({ error: "Demasiados intentos. Pedí un código nuevo." }, 400);
    return responder({ error: "El código venció. Pedí uno nuevo." }, 400);
  }

  return responder({ error: "Pedido inválido" }, 400);
}

/** Salir: se borra la entrada de este navegador. */
export async function DELETE(request: Request, { params }: { params: { token: string } }) {
  if (!mismoOrigen(request)) return responder({ error: "Pedido de otro sitio" }, 403);
  if (!tokenValido(params.token)) return responder({ estado: "invalido" }, 404);
  const sesion = leerEntrada(params.token);
  if (sesion) await createSupabaseAnon().rpc("presentacion_salir", { p_token: params.token, p_sesion: sesion });
  borrarEntrada(params.token);
  return responder({ ok: true });
}
