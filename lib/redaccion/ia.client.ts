export type ContextoIA = {
  /** El cliente del texto, con las notas de su ficha. */
  cliente?: { nombre: string; notas?: string | null };
  /** Textos anteriores del mismo cliente, los más recientes primero: la IA copia su estilo. */
  ejemplos?: string[];
  /** Fragmentos del material de marca del cliente (presentaciones, PDFs…) que vienen al caso con lo que se escribe. */
  material?: string[];
};

/**
 * "completar": las palabras terminan la que se está escribiendo. "seguir": esa palabra ya está terminada
 * y son las que pueden venir después (se pueden usar sin apretar espacio).
 */
export type RespuestaPalabras = { opciones: string[]; modo: "completar" | "seguir" };

export type PedidoPalabras = {
  /** Todo el texto hasta el cursor. */
  antes: string;
  /** Lo que hay después del cursor. */
  despues: string;
  /** Las letras de la palabra que se está escribiendo (vacío si el cursor está después de un espacio). */
  prefijo: string;
};

const MAX_ANTES = 1500;
const MAX_DESPUES = 200;
const MAX_EJEMPLOS = 4;
const MAX_EJEMPLO = 400;
const MAX_MATERIAL = 4;
const MAX_FRAGMENTO = 600;

/** Las ya pedidas, para no volver a pagar por lo mismo al borrar y reescribir. */
const cache = new Map<string, RespuestaPalabras>();

/** Le pide a la IA hasta tres palabras que encajen en el cursor. Si no puede, tira un Error con un mensaje para mostrar. */
export async function pedirPalabras(
  { antes, despues, prefijo }: PedidoPalabras,
  { cliente, ejemplos = [], material = [] }: ContextoIA,
  signal: AbortSignal
): Promise<RespuestaPalabras> {
  // El material cambia lo que la IA contesta: si se suma o se apaga un archivo, no se reusa lo de antes.
  const huella = [cliente?.notas?.length ?? 0, ...material.map((m) => `${m.length}:${m.slice(0, 24)}`)].join("|");
  const clave = [cliente?.nombre ?? "", huella, antes.slice(-400), prefijo, despues.slice(0, 60)].join("\u0000");
  const guardadas = cache.get(clave);
  if (guardadas) return guardadas;

  let res: Response;
  try {
    res = await fetch("/api/redaccion/ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        antes: antes.slice(-MAX_ANTES),
        despues: despues.slice(0, MAX_DESPUES),
        prefijo,
        cliente: cliente && { nombre: cliente.nombre, notas: cliente.notas ?? "" },
        ejemplos: ejemplos
          .map((e) => e.trim().slice(0, MAX_EJEMPLO))
          .filter(Boolean)
          .slice(0, MAX_EJEMPLOS),
        material: material
          .map((m) => m.trim().slice(0, MAX_FRAGMENTO))
          .filter(Boolean)
          .slice(0, MAX_MATERIAL),
      }),
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new Error("No pude conectar con la IA. Revisá tu conexión.");
  }

  const data = (await res.json().catch(() => null)) as { opciones?: string[]; modo?: string; error?: string } | null;
  if (!res.ok) {
    const sesion = res.status === 401 || res.status === 403;
    const error = new Error(data?.error ?? (sesion ? "Tu sesión venció: volvé a entrar para usar la IA." : "La IA no pudo sugerir palabras."));
    // 501: la clave no está configurada. No tiene sentido seguir pidiendo.
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }

  const opciones = Array.isArray(data?.opciones) ? data.opciones.filter((o) => typeof o === "string" && o) : [];
  const respuesta: RespuestaPalabras = { opciones, modo: data?.modo === "seguir" ? "seguir" : "completar" };
  if (opciones.length) {
    cache.set(clave, respuesta);
    if (cache.size > 80) cache.delete(cache.keys().next().value!);
  }
  return respuesta;
}
