/**
 * Saca el texto de los archivos del material de marca, en el navegador y sin IA: PDFs, presentaciones
 * (.pptx), documentos de Word (.docx) y texto plano. Con eso la IA de Redacción aprende cómo habla la
 * marca. Las imágenes y los archivos de diseño no tienen texto que leer: devuelven null.
 */

/** Lo máximo que se guarda por archivo (la base acepta 200.000). */
export const MAX_TEXT_CHARS = 150_000;

const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Texto de un XML de Office: los párrafos (`paragraph`) en líneas y el contenido de `run` pegado. */
export function xmlText(xml: string, paragraph: string, run: string) {
  const paragraphs = xml.match(new RegExp(`<${paragraph}[\\s>][\\s\\S]*?</${paragraph}>`, "g")) ?? [];
  const runs = new RegExp(`<${run}(?:\\s[^>]*)?>([\\s\\S]*?)</${run}>`, "g");
  const lines: string[] = [];
  for (const p of paragraphs) {
    let line = "";
    // Un salto de línea dentro del párrafo separa palabras: sin esto "hola<br/>mundo" quedaría "holamundo".
    const withBreaks = p.replace(/<(?:a|w):br(?=[\s/>])[^>]*>/g, `<${run}> </${run}>`);
    for (const m of withBreaks.matchAll(runs)) line += decodeEntities(m[1]);
    if (line.trim()) lines.push(line.trim());
  }
  return lines.join("\n");
}

/** Deja el texto limpio: sin espacios de más, sin guiones de corte de línea y sin pasarse del tope. */
export function cleanText(raw: string, max = MAX_TEXT_CHARS) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f​﻿]/g, "")
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

const slideNumber = (path: string) => Number(path.match(/(\d+)\.xml$/)?.[1] ?? 0);

async function zipTexts(file: File, folder: string, paragraph: string, run: string) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files)
    .filter((n) => n.startsWith(folder) && /\.xml$/.test(n))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  const out: string[] = [];
  for (const name of names) out.push(xmlText(await zip.files[name].async("string"), paragraph, run));
  return out.filter(Boolean);
}

async function pptxText(file: File) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const read = async (folder: string) => {
    const names = Object.keys(zip.files)
      .filter((n) => n.startsWith(folder) && /\.xml$/.test(n))
      .sort((a, b) => slideNumber(a) - slideNumber(b));
    const map = new Map<number, string>();
    for (const name of names) map.set(slideNumber(name), xmlText(await zip.files[name].async("string"), "a:p", "a:t"));
    return map;
  };
  const slides = await read("ppt/slides/");
  const notes = await read("ppt/notesSlides/");
  const out: string[] = [];
  for (const [n, text] of Array.from(slides).sort((a, b) => a[0] - b[0])) {
    const note = notes.get(n);
    out.push([text, note].filter(Boolean).join("\n"));
  }
  return out.filter(Boolean).join("\n\n");
}

/**
 * El texto de un archivo, o null si es de los que no tienen (imágenes, diseño, comprimidos). Un PDF
 * escaneado o una presentación solo de imágenes dan "": se guardan igual, pero la IA no tiene qué leer.
 */
export async function extractText(file: File): Promise<string | null> {
  const ext = extOf(file.name);
  if (ext === "pdf") {
    const { pdfText } = await import("./pdf");
    return cleanText(await pdfText(file, MAX_TEXT_CHARS));
  }
  if (ext === "pptx") return cleanText(await pptxText(file));
  if (ext === "docx") return cleanText((await zipTexts(file, "word/document", "w:p", "w:t")).join("\n"));
  if (["txt", "md", "csv"].includes(ext) || file.type.startsWith("text/")) return cleanText(await file.text());
  return null;
}
