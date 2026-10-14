import { NextResponse, type NextRequest } from "next/server";
import type { Drive } from "./google";

/**
 * Servir un archivo del Drive a través de la app (lo usan la ruta del estudio y la del link del
 * cliente):
 *  ?w=600         → miniatura de ese ancho (la genera Google; liviana para grillas y mockups)
 *  ?descargar=1   → el original, como descarga, con su nombre
 *  sin nada       → el original. Los videos piden por partes (Range) y se responden de a 4 MB:
 *                   ninguna respuesta pasa el límite de Vercel y se pueden adelantar.
 */
const CHUNK = 4 * 1024 * 1024;
export const VALID_DRIVE_ID = /^[\w-]{10,200}$/;

export async function servirArchivo(drive: Drive, id: string, request: NextRequest) {
  const w = Number(request.nextUrl.searchParams.get("w"));
  if (w > 0) {
    const thumb = await miniatura(drive, id, Math.min(Math.max(Math.round(w), 64), 2400));
    if (thumb) return thumb;
    // Sin miniatura (Google todavía la está generando): va el original.
  }

  let range = request.headers.get("range");
  // "bytes=0-" (hasta el final) se acota a un pedazo: el navegador pide el siguiente cuando lo necesita.
  const abierto = range?.match(/^bytes=(\d+)-$/);
  if (abierto) {
    const start = Number(abierto[1]);
    range = `bytes=${start}-${start + CHUNK - 1}`;
  }

  const r = await drive.contenido(id, range);
  if (!r.ok && r.status !== 206) {
    return NextResponse.json({ error: `Drive respondió ${r.status}` }, { status: r.status === 404 ? 404 : 502 });
  }

  const headers = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const v = r.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("Accept-Ranges", "bytes");
  // Un archivo de Drive no cambia con el mismo id (una versión nueva se sube como archivo nuevo).
  headers.set("Cache-Control", "private, max-age=31536000, immutable");
  if (request.nextUrl.searchParams.get("descargar")) {
    const meta = await drive.file(id, "name").catch(() => null);
    const name = meta?.name ?? "archivo";
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  }
  return new Response(r.body, { status: r.status, headers });
}

async function miniatura(drive: Drive, id: string, w: number) {
  const meta = await drive.file(id, "thumbnailLink").catch(() => null);
  if (!meta?.thumbnailLink) return null;
  // Google arma la miniatura del tamaño que se le pida cambiando el sufijo (=s220 → =w600).
  const url = meta.thumbnailLink.replace(/=s\d+$/, `=w${w}`);
  let r = await fetch(url, { cache: "no-store" });
  if (r.status === 401 || r.status === 403) r = await drive.fetch(url);
  if (!r.ok || !r.body) return null;
  return new Response(r.body, {
    headers: {
      "Content-Type": r.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
