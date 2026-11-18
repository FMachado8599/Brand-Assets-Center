"use client";

import { FORMATOS } from "./config";
import { etiquetaArchivo } from "./fechas";
import type { Medio, Pieza } from "./types";

/**
 * Bajar el material final (CM). Cada archivo se pide de a pedazos de 4 MB con Range (ninguna
 * respuesta de Vercel pasa ese tamaño), varios a la vez para que no espere uno por uno. Lo que se
 * baja va directo a un archivo en la compu (Chrome y Edge preguntan dónde guardarlo): así ni un
 * reel de 1 GB ni una plani entera de 5 GB pasan por la memoria del navegador. Varios archivos van
 * en un .zip sin comprimir (fotos y videos ya vienen comprimidos), armado mientras se baja.
 */

const CHUNK = 4 * 1024 * 1024;
/** Cuántos pedazos de un archivo se piden a la vez. */
const EN_VUELO = 3;
/** Sin poder escribir directo al disco (Firefox, Safari), lo que se arma en memoria no pasa de esto. */
const MAX_EN_MEMORIA = 800 * 1024 * 1024;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Un pedazo del archivo, con hasta 3 intentos si la red o el servidor fallan. */
async function pedazo(url: string, start: number, end: number): Promise<{ datos: Uint8Array; total: number | null }> {
  let error: Error = new Error("No se pudo bajar el archivo");
  for (let intento = 0; intento < 3; intento++) {
    if (intento) await esperar(600 * 2 ** intento);
    let r: Response;
    try {
      r = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
    } catch {
      error = new Error("Se cortó la conexión mientras se bajaba el archivo");
      continue;
    }
    if (r.status === 206) {
      const total = Number(r.headers.get("content-range")?.match(/\/(\d+)$/)?.[1]) || null;
      return { datos: new Uint8Array(await r.arrayBuffer()), total };
    }
    if (r.ok) {
      // El servidor mandó el archivo entero: se toma el pedazo pedido.
      const todo = new Uint8Array(await r.arrayBuffer());
      return { datos: todo.subarray(start, end + 1), total: todo.byteLength };
    }
    error = new Error(`No se pudo bajar el archivo (${r.status})`);
    if (r.status < 500 && r.status !== 429) break;
  }
  throw error;
}

/** El archivo como un stream: los pedazos llegan en orden aunque se pidan varios a la vez. */
function streamDe(url: string, tamano: number, onBytes: (n: number) => void): ReadableStream<Uint8Array> {
  let total: number | null = tamano > 0 ? tamano : null;
  let siguiente = 0;
  const cola: Promise<Uint8Array>[] = [];
  const llenar = () => {
    while (total !== null && siguiente < total && cola.length < EN_VUELO) {
      const start = siguiente;
      const end = Math.min(start + CHUNK, total) - 1;
      siguiente = end + 1;
      cola.push(pedazo(url, start, end).then((r) => r.datos));
    }
  };
  // highWaterMark 0: no pide nada hasta que alguien lee (el zip lee un archivo después del otro).
  return new ReadableStream<Uint8Array>(
    {
      async pull(ctrl) {
        if (total === null) {
          // Sin el tamaño, el primer pedazo lo dice.
          const r = await pedazo(url, 0, CHUNK - 1);
          total = r.total ?? r.datos.byteLength;
          siguiente = r.datos.byteLength;
          onBytes(r.datos.byteLength);
          ctrl.enqueue(r.datos);
          if (siguiente >= total) ctrl.close();
          return;
        }
        llenar();
        const proximo = cola.shift();
        if (!proximo) return ctrl.close();
        const datos = await proximo;
        onBytes(datos.byteLength);
        ctrl.enqueue(datos);
        llenar();
        if (!cola.length && siguiente >= total) ctrl.close();
      },
    },
    { highWaterMark: 0 },
  );
}

type ConSelector = Window & {
  showSaveFilePicker?: (o: { suggestedName: string }) => Promise<{ createWritable: () => Promise<WritableStream> }>;
};

/** Dónde se escribe lo que se baja: un archivo en la compu (si el navegador deja), o null. */
async function archivoEnDisco(nombre: string): Promise<WritableStream | null> {
  const w = window as ConSelector;
  if (typeof w.showSaveFilePicker !== "function") return null;
  const handle = await w.showSaveFilePicker({ suggestedName: nombre });
  return handle.createWritable();
}

/** Cancelar el "Guardar como" no es un error. */
export const esCancelacion = (e: unknown) => (e as Error)?.name === "AbortError";

/** Guarda un stream: directo al disco o, si no se puede, armado en memoria (hasta MAX_EN_MEMORIA). */
async function guardarStream(stream: ReadableStream<Uint8Array>, nombre: string, total: number, destino: WritableStream | null) {
  if (destino) return stream.pipeTo(destino);
  if (total > MAX_EN_MEMORIA) {
    await stream.cancel();
    throw new Error("Es demasiado para bajar junto desde este navegador: usá Chrome o Edge, o bajalo desde la carpeta del Drive");
  }
  guardar(await new Response(stream).blob(), nombre);
}

export function guardar(blob: Blob, nombre: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const extension = (m: Medio) => {
  const delNombre = m.nombre.split(".").pop();
  if (delNombre && delNombre.length <= 5 && delNombre !== m.nombre) return delNombre.toLowerCase();
  return m.mime.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") ?? "bin";
};

const limpio = (s: string) =>
  s
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

/** "01-10 Post - La final.jpg", "06-10 Carrusel - Historia de la copa 2.jpg", "14-10 Reel portada.jpg". */
export function nombreArchivo(p: Pieza, m: Medio, titulo = p.titulo) {
  const finales = p.medios.filter((x) => x.rol === "final");
  const n = finales.length > 1 && m.rol === "final" ? ` ${finales.indexOf(m) + 1}` : "";
  const t = titulo ? ` - ${limpio(titulo)}` : "";
  const portada = m.rol === "portada" ? " portada" : "";
  return `${etiquetaArchivo(p.fecha)} ${FORMATOS[p.formato].label}${t}${n}${portada}.${extension(m)}`;
}

export type ArchivoZip = {
  carpeta?: string;
  nombre: string;
  url: string;
  tamano: number;
};

/**
 * Uno: se guarda tal cual. Varios: un .zip con sus carpetas. Pide primero dónde guardarlo (si el
 * navegador deja) y recién después empieza a bajar.
 */
export async function descargar(archivos: ArchivoZip[], nombreZip: string, onProgress?: (p: number) => void) {
  if (!archivos.length) return;
  const total = archivos.reduce((s, a) => s + (a.tamano || 0), 0);
  let bajado = 0;
  const avance = (n: number) => {
    bajado += n;
    if (total) onProgress?.(Math.min(1, bajado / total));
  };

  try {
    if (archivos.length === 1) {
      const a = archivos[0];
      const destino = await archivoEnDisco(a.nombre);
      await guardarStream(streamDe(a.url, a.tamano, avance), a.nombre, a.tamano, destino);
    } else {
      const nombre = nombreZip.endsWith(".zip") ? nombreZip : `${nombreZip}.zip`;
      const destino = await archivoEnDisco(nombre);
      const { downloadZip } = await import("client-zip");
      const ahora = new Date();
      // De a un archivo: cada uno recién se empieza a pedir cuando el zip llega a él.
      async function* entradas() {
        for (const a of archivos) {
          yield {
            name: a.carpeta ? `${a.carpeta}/${a.nombre}` : a.nombre,
            input: streamDe(a.url, a.tamano, avance),
            size: a.tamano || undefined,
            lastModified: ahora,
          };
        }
      }
      const zip = downloadZip(entradas());
      await guardarStream(zip.body!, nombre, total, destino);
    }
    onProgress?.(1);
  } catch (e) {
    if (esCancelacion(e)) return;
    throw e;
  }
}
