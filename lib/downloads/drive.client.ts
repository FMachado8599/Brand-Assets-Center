"use client";

import type { DriveFolder } from "./types";

/**
 * Guardar en Drive desde el navegador, con la cuenta de Google de cada persona.
 *
 * El permiso es drive.file: la app solo toca lo que ella crea y las carpetas que la persona le confirma.
 * Por eso, la primera vez que se pega el link de una carpeta, se abre el selector de Google ya parado en
 * esa carpeta y se confirma con un click (después queda recordada). Así nadie le da a la app acceso a
 * todo su Drive, y Google no pide verificar la app.
 *
 * Los archivos van directo del navegador a Google: no pasan por Vercel.
 */

export type DriveConfig = { clientId: string; apiKey: string };

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

export class DriveError extends Error {
  constructor(
    message: string,
    /** La carpeta ya no está disponible para la app: hay que elegirla de nuevo. */
    public lostFolder = false
  ) {
    super(message);
  }
}

/** El id de la carpeta en un link de Drive (drive.google.com/drive/folders/<id>, ?id=<id>, o el id solo). */
export function parseFolderLink(text: string) {
  const t = text.trim();
  const id = t.match(/\/folders\/([\w-]{10,})/)?.[1] ?? t.match(/[?&]id=([\w-]{10,})/)?.[1];
  if (id) return id;
  return /^[\w-]{20,}$/.test(t) ? t : null;
}

/* ───────────── Scripts de Google ───────────── */

const scripts = new Map<string, Promise<void>>();

function loadScript(src: string) {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scripts.delete(src);
        reject(new DriveError("No pude cargar los servicios de Google. Revisá la conexión o un bloqueador de anuncios."));
      };
      document.head.appendChild(el);
    });
    scripts.set(src, p);
  }
  return p;
}

/** Se llama apenas se abre el panel de Drive: el popup de Google tiene que abrirse en el mismo click. */
export function preloadDrive() {
  loadScript("https://accounts.google.com/gsi/client").catch(() => {});
  loadScript("https://apis.google.com/js/api.js").catch(() => {});
}

/* ───────────── Permiso (token) ───────────── */

let token: { value: string; expires: number; client: string } | null = null;

/**
 * El token de Google para Drive. La primera vez abre el popup para dar permiso; después se renueva solo
 * (Google lo da por una hora). Hay que llamarlo directo desde un click, sin esperar otra cosa antes:
 * si no, el navegador bloquea el popup.
 */
export async function getDriveToken(cfg: DriveConfig, hint?: string | null): Promise<string> {
  if (token && token.client === cfg.clientId && token.expires - Date.now() > 60_000) return token.value;
  await loadScript("https://accounts.google.com/gsi/client");
  return new Promise<string>((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId,
      scope: SCOPE,
      hint: hint ?? undefined,
      callback: (resp: any) => {
        if (resp.error || !resp.access_token) return reject(new DriveError("Google no dio permiso para guardar en Drive."));
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE)) {
          return reject(new DriveError("Hace falta tildar el permiso de Drive en la ventana de Google."));
        }
        token = { value: resp.access_token, expires: Date.now() + Number(resp.expires_in ?? 3600) * 1000, client: cfg.clientId };
        resolve(resp.access_token);
      },
      error_callback: (err: any) =>
        reject(
          new DriveError(
            err?.type === "popup_closed"
              ? "Se cerró la ventana de Google antes de dar el permiso."
              : err?.type === "popup_failed_to_open"
                ? "El navegador bloqueó la ventana de Google: permití las ventanas emergentes para este sitio."
                : "No se pudo conectar con Google."
          )
        ),
    });
    client.requestAccessToken({ prompt: token ? "" : undefined });
  });
}

export function forgetDriveToken() {
  const value = token?.value;
  token = null;
  if (value) window.google?.accounts.oauth2.revoke(value, () => {});
}

/* ───────────── Carpeta ───────────── */

type DriveFile = { id: string; name: string; mimeType: string; webViewLink?: string; capabilities?: { canAddChildren?: boolean } };

async function driveFetch(url: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) token = null;
  return res;
}

/** La carpeta, si la app ya puede verla; null si todavía hay que confirmarla con el selector. */
export async function getFolder(id: string, accessToken: string): Promise<DriveFolder | null> {
  const qs = new URLSearchParams({ fields: "id,name,mimeType,webViewLink,capabilities(canAddChildren)", supportsAllDrives: "true" });
  const res = await driveFetch(`${API}/files/${encodeURIComponent(id)}?${qs}`, accessToken);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new DriveError(`Drive respondió ${res.status}. Probá de nuevo en un rato.`);
  const file = (await res.json()) as DriveFile;
  if (file.mimeType !== FOLDER) throw new DriveError("Ese link es de un archivo, no de una carpeta.");
  if (file.capabilities?.canAddChildren === false) {
    throw new DriveError(`Tu cuenta puede ver "${file.name}" pero no agregar archivos: pedí permiso de edición.`);
  }
  return { id: file.id, name: file.name, url: file.webViewLink ?? `https://drive.google.com/drive/folders/${file.id}` };
}

/**
 * Abre el selector de Google mostrando solo esa carpeta: al elegirla, la persona le da a la app permiso
 * para guardar ahí. Devuelve false si cerró el selector sin elegir.
 */
export async function confirmFolder(cfg: DriveConfig, id: string, accessToken: string): Promise<boolean> {
  await loadScript("https://apis.google.com/js/api.js");
  await new Promise<void>((resolve) => window.gapi.load("picker", { callback: resolve }));
  const picker = window.google.picker;

  return new Promise<boolean>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(FOLDER)
      .setFileIds(id);
    new picker.PickerBuilder()
      .addView(view)
      .enableFeature(picker.Feature.SUPPORT_DRIVES)
      .setOAuthToken(accessToken)
      .setDeveloperKey(cfg.apiKey)
      // El número de proyecto de Google Cloud: es lo que va antes del guion en el client id.
      .setAppId(cfg.clientId.split("-")[0])
      .setTitle("Confirmá la carpeta donde se guardan las descargas")
      .setLocale("es-419")
      .setCallback((data: any) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs?.some((d: any) => d.id === id) ?? false);
        else if (data.action === picker.Action.CANCEL) resolve(false);
      })
      .build()
      .setVisible(true);
  });
}

/* ───────────── Subida ───────────── */

/**
 * Sube el archivo a la carpeta en una sesión "resumable": primero se abre la sesión y después va el
 * archivo entero (con XMLHttpRequest, que es lo que informa el avance de la subida).
 */
export async function uploadToDrive(
  blob: Blob,
  name: string,
  folderId: string,
  accessToken: string,
  onProgress: (percent: number) => void
): Promise<{ id: string; url: string }> {
  const qs = new URLSearchParams({ uploadType: "resumable", supportsAllDrives: "true", fields: "id,webViewLink" });
  const start = await driveFetch(`${UPLOAD}/files?${qs}`, accessToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": blob.type || "application/octet-stream",
      "X-Upload-Content-Length": String(blob.size),
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  if (start.status === 404) throw new DriveError("Perdí el acceso a la carpeta de Drive: elegila de nuevo.", true);
  if (!start.ok) throw new DriveError(`Drive no aceptó el archivo (${start.status}).`);
  const session = start.headers.get("Location");
  if (!session) throw new DriveError("Drive no abrió la subida. Probá de nuevo.");

  const file = await new Promise<{ id: string; webViewLink?: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", session);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          return resolve(JSON.parse(xhr.responseText));
        } catch {
          return reject(new DriveError("Drive respondió algo que no entiendo."));
        }
      }
      reject(new DriveError(`La subida a Drive falló (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new DriveError("Se cortó la conexión mientras se subía a Drive."));
    xhr.send(blob);
  });
  return { id: file.id, url: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view` };
}
