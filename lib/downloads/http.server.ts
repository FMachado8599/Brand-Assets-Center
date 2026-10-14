/** Lo compartido por los lectores de cada plataforma. Sin módulos de Node: lo usa también la ruta edge de descarga. */

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** Pinterest e Instagram le sirven a un navegador común la página con los datos ya renderizados. */
export const BROWSER_HEADERS = {
  "User-Agent": BROWSER_UA,
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
};

export class DownloadError extends Error {
  constructor(
    message: string,
    public status = 502
  ) {
    super(message);
  }
}

/** El peso del archivo, si el CDN lo informa rápido; si no, la fila simplemente no lo muestra. */
export async function contentLength(url: string) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: BROWSER_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return Number(res.headers.get("content-length")) || undefined;
  } catch {
    return undefined;
  }
}
