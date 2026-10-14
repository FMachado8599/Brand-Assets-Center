"use client";

import { FORMATOS } from "./config";
import { etiquetaArchivo } from "./fechas";
import type { Medio, Pieza } from "./types";

/**
 * Bajar el material final (CM). Los archivos se piden de a pedazos de 4 MB con Range: así un reel
 * de 300 MB pasa por la app sin chocar con el límite de cada respuesta de Vercel. Uno solo se
 * guarda tal cual; varios, en un .zip con carpetas por día.
 */

const CHUNK = 4 * 1024 * 1024;

export async function bajarBlob(url: string, onProgress?: (bytes: number, total: number) => void): Promise<Blob> {
  const partes: Blob[] = [];
  let start = 0;
  let total = Infinity;
  let tipo = "";
  while (start < total) {
    const r = await fetch(url, { headers: { Range: `bytes=${start}-${start + CHUNK - 1}` } });
    if (!r.ok) throw new Error(`No se pudo bajar el archivo (${r.status})`);
    tipo ||= r.headers.get("content-type") ?? "";
    const blob = await r.blob();
    if (r.status === 200) return blob; // vino entero
    partes.push(blob);
    const rango = r.headers.get("content-range")?.match(/\/(\d+)$/);
    total = rango ? Number(rango[1]) : start + blob.size;
    start += blob.size;
    onProgress?.(start, total);
    if (!blob.size) break;
  }
  return new Blob(partes, { type: tipo });
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

const limpio = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 60);

/** "01-10 Post - La final.jpg", "06-10 Carrusel - Historia de la copa 2.jpg", "14-10 Reel portada.jpg". */
export function nombreArchivo(p: Pieza, m: Medio, titulo = p.titulo) {
  const finales = p.medios.filter((x) => x.rol === "final");
  const n = finales.length > 1 && m.rol === "final" ? ` ${finales.indexOf(m) + 1}` : "";
  const t = titulo ? ` - ${limpio(titulo)}` : "";
  const portada = m.rol === "portada" ? " portada" : "";
  return `${etiquetaArchivo(p.fecha)} ${FORMATOS[p.formato].label}${t}${n}${portada}.${extension(m)}`;
}

export type ArchivoZip = { carpeta?: string; nombre: string; url: string; tamano: number };

/** Uno: se guarda directo. Varios: un .zip (sin comprimir: fotos y videos ya vienen comprimidos). */
export async function descargar(archivos: ArchivoZip[], nombreZip: string, onProgress?: (p: number) => void) {
  if (!archivos.length) return;
  const total = archivos.reduce((s, a) => s + (a.tamano || 1), 0);
  let listo = 0;
  const avance = (bytes: number) => onProgress?.(Math.min(1, (listo + bytes) / total));

  if (archivos.length === 1) {
    const a = archivos[0];
    guardar(await bajarBlob(a.url, (b) => avance(b)), a.nombre);
    onProgress?.(1);
    return;
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const a of archivos) {
    const blob = await bajarBlob(a.url, (b) => avance(b));
    zip.file(a.carpeta ? `${a.carpeta}/${a.nombre}` : a.nombre, blob, { binary: true });
    listo += a.tamano || 1;
    avance(0);
  }
  const out = await zip.generateAsync({ type: "blob", compression: "STORE" });
  guardar(out, nombreZip.endsWith(".zip") ? nombreZip : `${nombreZip}.zip`);
  onProgress?.(1);
}
