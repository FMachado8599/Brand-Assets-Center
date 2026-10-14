"use client";

import type { Medio } from "./types";

/**
 * Subir un archivo del material final al Drive del estudio:
 *  1. el servidor arma las carpetas y abre una sesión de subida en Google;
 *  2. el navegador manda el archivo directo a esa sesión (los videos no pasan por Vercel);
 *  3. si el navegador no puede leer la respuesta de Google, se le pregunta al servidor cómo quedó.
 */

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  imageMediaMetadata?: { width?: number; height?: number };
  videoMediaMetadata?: { width?: number; height?: number };
};

export class SubidaError extends Error {
  constructor(
    message: string,
    public sinDrive = false
  ) {
    super(message);
  }
}

/** Ancho y alto del archivo, leídos en el navegador (Drive tarda en tenerlos para los videos). */
async function medidas(file: File): Promise<{ ancho: number | null; alto: number | null }> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { ancho: img.naturalWidth, alto: img.naturalHeight };
    }
    if (file.type.startsWith("video/")) {
      return await new Promise((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => resolve({ ancho: v.videoWidth || null, alto: v.videoHeight || null });
        v.onerror = () => resolve({ ancho: null, alto: null });
        v.src = url;
      });
    }
  } catch {
    /* sin medidas: no es grave */
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return { ancho: null, alto: null };
}

function putDirecto(uploadUrl: string, file: File, onProgress?: (p: number) => void) {
  return new Promise<DriveFile | null>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          resolve(JSON.parse(xhr.responseText) as DriveFile);
        } catch {
          resolve(null);
        }
      } else reject(new SubidaError(`Google rechazó el archivo (${xhr.status})`));
    };
    // status 0: corte de red o CORS. Puede que el archivo igual haya llegado: se pregunta al servidor.
    xhr.onerror = () => resolve(null);
    xhr.send(file);
  });
}

export async function subirMedio(
  piezaId: string,
  file: File,
  rol: Medio["rol"],
  onProgress?: (p: number) => void
): Promise<Medio> {
  const r = await fetch("/api/drive/subir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ piezaId, nombre: file.name, mime: file.type, tamano: file.size }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new SubidaError(body.error ?? "No se pudo abrir la subida", Boolean(body.sinDrive));

  const [subido, dims] = await Promise.all([putDirecto(body.uploadUrl, file, onProgress), medidas(file)]);
  let archivo = subido;
  if (!archivo?.id) {
    const check = await fetch("/api/drive/subir", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadUrl: body.uploadUrl, tamano: file.size }),
    });
    const res = await check.json().catch(() => ({}));
    if (!check.ok || !res.file?.id) throw new SubidaError(res.error ?? "La subida se cortó. Probá de nuevo.");
    archivo = res.file as DriveFile;
  }
  onProgress?.(1);

  return {
    id: crypto.randomUUID(),
    drive_id: archivo.id,
    nombre: archivo.name ?? file.name,
    mime: archivo.mimeType || file.type,
    tamano: Number(archivo.size ?? file.size),
    ancho: dims.ancho ?? archivo.imageMediaMetadata?.width ?? archivo.videoMediaMetadata?.width ?? null,
    alto: dims.alto ?? archivo.imageMediaMetadata?.height ?? archivo.videoMediaMetadata?.height ?? null,
    rol,
  };
}

/** Manda un archivo a la papelera del Drive. Si falla no pasa nada: queda en la carpeta. */
export function borrarMedio(driveId: string) {
  return fetch(`/api/drive/archivo/${encodeURIComponent(driveId)}`, { method: "DELETE" }).catch(() => null);
}
