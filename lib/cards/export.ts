import type { FontFace } from "../types";
import { resolveFace, type ResolvedFace } from "../fonts/fonts";

export type Run = {
  text: string;
  face: ResolvedFace | null;
  sizePx: number;
  underline: boolean;
};

export type Block = {
  runs: Run[];
  bullet: string | null;
};

type InlineState = {
  fontFullName: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  sizePx: number;
};

const BLOCK_TAGS = new Set([
  "P", "DIV", "LI", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "PRE",
]);

const DEFAULT_SIZE = 16;

function readStyle(el: HTMLElement, state: InlineState): InlineState {
  const next = { ...state };
  const tag = el.tagName;

  if (tag === "STRONG" || tag === "B") next.bold = true;
  if (tag === "EM" || tag === "I") next.italic = true;
  if (tag === "U") next.underline = true;

  const fam = el.style.fontFamily;
  if (fam) next.fontFullName = fam.split(",")[0].replace(/['"]/g, "").trim();

  const weight = el.style.fontWeight;
  if (weight) {
    const n = parseInt(weight, 10);
    if (weight === "bold" || (!isNaN(n) && n >= 600)) next.bold = true;
    if (weight === "normal" || (!isNaN(n) && n < 600)) next.bold = false;
  }

  const fs = el.style.fontStyle;
  if (fs === "italic") next.italic = true;
  if (fs === "normal") next.italic = false;

  const size = el.style.fontSize;
  if (size) {
    const n = parseFloat(size);
    if (!isNaN(n)) next.sizePx = size.endsWith("pt") ? n * (4 / 3) : n;
  }

  if (el.style.textDecoration?.includes("underline")) next.underline = true;

  return next;
}

/** Aplana el HTML del editor en bloques de "runs" con formato resuelto. */
export function parseBlocks(html: string, fonts: FontFace[]): Block[] {
  if (typeof window === "undefined") return [];
  const doc = new DOMParser().parseFromString(
    `<body>${html || ""}</body>`,
    "text/html"
  );

  const blocks: Block[] = [];
  let current: Block = { runs: [], bullet: null };
  let pendingBullet: string | null = null;

  const push = () => {
    if (current.runs.some((r) => r.text.length)) blocks.push(current);
    current = { runs: [], bullet: null };
  };

  const addRun = (run: Run) => {
    if (!current.runs.length && pendingBullet) {
      current.bullet = pendingBullet;
      pendingBullet = null;
    }
    current.runs.push(run);
  };

  const walk = (node: Node, state: InlineState, listType: string | null, index: number) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").replace(/\u00a0/g, " ");
      if (!text) return;
      addRun({
        text,
        face: resolveFace(fonts, state.fontFullName, state.bold, state.italic),
        sizePx: state.sizePx,
        underline: state.underline,
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName;

    if (tag === "BR") {
      push();
      return;
    }

    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) push();

    if (tag === "LI") {
      pendingBullet = listType === "OL" ? `${index}.` : "•";
    }

    const nextState = readStyle(el, state);
    const nextList = tag === "UL" || tag === "OL" ? tag : listType;

    let i = 1;
    el.childNodes.forEach((child) => {
      walk(child, nextState, nextList, i);
      if ((child as HTMLElement).tagName === "LI") i++;
    });

    if (isBlock) push();
    if (tag === "LI") pendingBullet = null;
  };

  const initial: InlineState = {
    fontFullName: null,
    bold: false,
    italic: false,
    underline: false,
    sizePx: DEFAULT_SIZE,
  };

  doc.body.childNodes.forEach((n) => walk(n, initial, null, 1));
  push();

  return blocks;
}

/** Texto plano, sin formato. */
export function toPlainText(blocks: Block[]): string {
  return blocks
    .map((b) => (b.bullet ? `${b.bullet} ` : "") + b.runs.map((r) => r.text).join(""))
    .join("\n");
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * HTML con estilos inline y nombres de fuente completos.
 * Es el formato que leen Word, Google Docs, InDesign y Figma.
 */
export function toRichHtml(blocks: Block[]): string {
  const body = blocks
    .map((b) => {
      const inner = b.runs
        .map((r) => {
          const f = r.face;
          const styles = [`font-size:${Math.round(r.sizePx)}px`];
          if (f) {
            styles.unshift(
              `font-family:'${f.fullName}','${f.family}',sans-serif`,
              `font-weight:${f.syntheticBold ? 700 : f.weight}`,
              `font-style:${f.italic || f.syntheticItalic ? "italic" : "normal"}`
            );
          }
          if (r.underline) styles.push("text-decoration:underline");
          return `<span style="${styles.join(";")}">${esc(r.text)}</span>`;
        })
        .join("");
      const prefix = b.bullet ? `${b.bullet}&nbsp;` : "";
      return `<p style="margin:0 0 6px 0">${prefix}${inner}</p>`;
    })
    .join("");

  return `<meta charset="utf-8"><div style="color:#000">${body}</div>`;
}

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * SVG: el camino más fiel hacia Illustrator.
 *
 * Cada fragmento se convierte en un <tspan> con su propia font-family, y
 * Illustrator lo abre como texto vivo y editable respetando cada fuente.
 * A diferencia del portapapeles, acá los cambios de peso dentro de una
 * misma línea sobreviven: "Montserrat Medium" y "Montserrat Bold" entran
 * como dos fuentes distintas en el mismo párrafo.
 */
export function toSvg(blocks: Block[]): string {
  const PAD = 24;
  let y = 0;
  let width = 0;

  const texts = blocks
    .map((b) => {
      const maxSize = Math.max(12, ...b.runs.map((r) => r.sizePx));
      const lineHeight = maxSize * 1.35;
      y += lineHeight;

      const prefix = b.bullet ? `${b.bullet} ` : "";
      // Ancho aproximado: alcanza para que Illustrator no recorte el lienzo
      const guess = b.runs.reduce((n, r) => n + r.text.length * r.sizePx * 0.58, prefix.length * maxSize * 0.58);
      width = Math.max(width, guess);

      const spans = b.runs
        .map((r) => {
          const f = r.face;
          const attrs = [
            f ? `font-family="${xmlEscape(f.fullName)}"` : "",
            f ? `font-weight="${f.syntheticBold ? 700 : f.weight}"` : "",
            f && (f.italic || f.syntheticItalic) ? `font-style="italic"` : "",
            `font-size="${Math.round(r.sizePx)}"`,
            r.underline ? `text-decoration="underline"` : "",
          ]
            .filter(Boolean)
            .join(" ");
          return `<tspan ${attrs} xml:space="preserve">${xmlEscape(r.text)}</tspan>`;
        })
        .join("");

      const bullet = prefix ? `<tspan font-size="${Math.round(maxSize)}" xml:space="preserve">${xmlEscape(prefix)}</tspan>` : "";
      return `  <text x="${PAD}" y="${Math.round(y + PAD)}" fill="#000000">${bullet}${spans}</text>`;
    })
    .join("\n");

  const w = Math.ceil(width + PAD * 2);
  const h = Math.ceil(y + PAD * 2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${texts}
</svg>`;
}

function rtfEscape(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\") out += "\\\\";
    else if (ch === "{") out += "\\{";
    else if (ch === "}") out += "\\}";
    else if (code < 128) out += ch;
    else if (code <= 0xffff) out += `\\u${code > 32767 ? code - 65536 : code}?`;
    else {
      const h = Math.floor((code - 0x10000) / 0x400) + 0xd800;
      const l = ((code - 0x10000) % 0x400) + 0xdc00;
      out += `\\u${h > 32767 ? h - 65536 : h}?\\u${l > 32767 ? l - 65536 : l}?`;
    }
  }
  return out;
}

/**
 * RTF: el camino más confiable hacia Illustrator (Archivo → Colocar)
 * y hacia InDesign. La tabla de fuentes usa el nombre completo de cada
 * face, así que "Montserrat Light" y "Montserrat Bold" llegan como dos
 * fuentes distintas en el mismo párrafo — que es exactamente lo que
 * necesitás para no perder los pesos.
 */
export function toRtf(blocks: Block[]): string {
  const names: string[] = [];
  const idOf = (name: string) => {
    const i = names.indexOf(name);
    if (i >= 0) return i;
    names.push(name);
    return names.length - 1;
  };

  const body = blocks
    .map((b) => {
      const runs = b.runs
        .map((r) => {
          const name = r.face?.fullName || "Helvetica";
          const fi = idOf(name);
          const fs = Math.round(r.sizePx * 0.75 * 2); // px → pt → medios puntos
          const cmds = [`\\f${fi}`, `\\fs${fs}`];
          if (r.face?.syntheticBold) cmds.push("\\b");
          if (r.face?.syntheticItalic || r.face?.italic) cmds.push("\\i");
          if (r.underline) cmds.push("\\ul");
          return `{${cmds.join("")} ${rtfEscape(r.text)}}`;
        })
        .join("");
      const prefix = b.bullet ? `${rtfEscape(b.bullet)}\\tab ` : "";
      return `\\pard\\sa0\\sl240\\slmult1 ${prefix}${runs}\\par`;
    })
    .join("\n");

  const fontTable = names
    .map((n, i) => `{\\f${i}\\fnil\\fcharset0 ${rtfEscape(n)};}`)
    .join("");

  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\n{\\fonttbl${fontTable}}\n${body}\n}`;
}

/** Lista de faces usadas, para mostrar en la tarjeta. */
export function facesUsed(blocks: Block[]): string[] {
  const set = new Set<string>();
  blocks.forEach((b) =>
    b.runs.forEach((r) => {
      if (r.face) set.add(r.face.fullName);
    })
  );
  return Array.from(set);
}
