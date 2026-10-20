/**
 * Lee el texto de un PDF en el navegador, con pdf.js (Mozilla, Apache 2.0). Los dos archivos están en
 * public/vendor/pdfjs y se bajan recién cuando se sube un PDF: no entran en el bundle ni pesan en el
 * resto de la app.
 */

type TextItem = { str?: string; hasEOL?: boolean };
type PdfPage = { getTextContent(): Promise<{ items: TextItem[] }>; cleanup(): void };
type PdfDocument = { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> };
type PdfLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array }): { promise: Promise<PdfDocument> };
};

const BASE = "/vendor/pdfjs";
const MAX_PAGES = 300;

let loading: Promise<PdfLib> | null = null;

function loadPdfJs() {
  const w = window as unknown as Record<string, PdfLib | undefined>;
  const found = () => w["pdfjs-dist/build/pdf"] ?? w.pdfjsLib;
  loading ??= new Promise<PdfLib>((resolve, reject) => {
    const ready = found();
    if (ready) return resolve(ready);
    const script = document.createElement("script");
    script.src = `${BASE}/pdf.min.js`;
    script.async = true;
    script.onload = () => {
      const lib = found();
      if (!lib) return reject(new Error("No se pudo cargar el lector de PDFs"));
      lib.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.js`;
      resolve(lib);
    };
    script.onerror = () => reject(new Error("No se pudo cargar el lector de PDFs"));
    document.head.append(script);
  });
  // Si falló, la próxima vez se vuelve a intentar.
  loading.catch(() => (loading = null));
  return loading;
}

/** El texto del PDF, página por página y hasta `maxChars` letras. Un escaneo (solo imágenes) da "". */
export async function pdfText(file: File, maxChars: number): Promise<string> {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const parts: string[] = [];
    let total = 0;
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES) && total < maxChars; n++) {
      const page = await doc.getPage(n);
      const { items } = await page.getTextContent();
      page.cleanup();
      const text = items.map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : " ")).join("");
      parts.push(text);
      total += text.length;
    }
    return parts.join("\n\n");
  } finally {
    doc.destroy().catch(() => {});
  }
}
