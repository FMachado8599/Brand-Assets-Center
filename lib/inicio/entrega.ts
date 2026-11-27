/**
 * Pasar archivos de una página a otra sin subirlos a ningún lado: se sueltan en el Inicio, se elige
 * qué hacer y la herramienta los toma al abrir. Vive en la memoria de la pestaña (la navegación de la
 * app no recarga la página), así que si se recarga, se pierde: es solo para el salto.
 */

export type Destino = "conversor" | "compresor" | "retoque" | "gif" | "ads";

type Paquete = { destino: Destino; archivos: File[]; cuando: number };

let pendiente: Paquete | null = null;

/** Deja los archivos para esa herramienta. */
export function entregarArchivos(destino: Destino, archivos: File[]) {
  pendiente = { destino, archivos, cuando: Date.now() };
}

/**
 * Los archivos que dejaron para esa herramienta (y los saca, para que no se vuelvan a sumar). Pasado un
 * minuto ya no valen: si alguien volvió atrás y después entró por otro lado, no le aparecen de la nada.
 */
export function tomarArchivos(destinos: Destino | Destino[]): { destino: Destino; archivos: File[] } | null {
  const lista = Array.isArray(destinos) ? destinos : [destinos];
  if (!pendiente || !lista.includes(pendiente.destino)) return null;
  const p = pendiente;
  pendiente = null;
  if (Date.now() - p.cuando > 60_000) return null;
  return { destino: p.destino, archivos: p.archivos };
}

export const esImagen = (f: File) => f.type.startsWith("image/");
export const esVideo = (f: File) => f.type.startsWith("video/");
