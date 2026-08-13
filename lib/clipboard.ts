/**
 * Copiar con formato.
 *
 * Estrategia 1: la API moderna de portapapeles, con text/html y text/plain
 * en la misma operación. El sistema operativo se encarga de ofrecerle a
 * cada app el sabor que entiende.
 *
 * Estrategia 2 (fallback): un div contenteditable oculto + execCommand.
 * Es viejo, pero en algunos navegadores genera más "sabores" de
 * portapapeles que la API nueva, y ciertos programas de escritorio solo
 * leen esos.
 */
export async function copyRich(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch {
    /* seguimos con el fallback */
  }
  return copyRichLegacy(html, text);
}

function copyRichLegacy(html: string, text: string): boolean {
  const holder = document.createElement("div");
  holder.contentEditable = "true";
  holder.innerHTML = html;
  holder.setAttribute("aria-hidden", "true");
  Object.assign(holder.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    whiteSpace: "pre-wrap",
    opacity: "0",
  } as CSSStyleDeclaration);

  document.body.appendChild(holder);
  const range = document.createRange();
  range.selectNodeContents(holder);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  sel?.removeAllRanges();
  document.body.removeChild(holder);

  if (!ok) {
    try {
      navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = false;
    }
  }
  return ok;
}

export async function copyPlain(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyRichLegacy(text, text);
  }
}

function download(content: string, mime: string, filename: string, ext: string) {
  const safe = (filename || "tarjeta").replace(/[^\w\-\s]/g, "").trim() || "tarjeta";
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadRtf(rtf: string, filename: string) {
  download(rtf, "application/rtf", filename, "rtf");
}

export function downloadSvg(svg: string, filename: string) {
  download(svg, "image/svg+xml", filename, "svg");
}
