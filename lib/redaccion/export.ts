/**
 * El texto con formato del editor (el JSON de tiptap) convertido a lo que
 * entiende cada lugar donde se pega:
 *
 *  - plano: sin formato, las listas con "•" y "1." (Instagram, WhatsApp, campos de texto),
 *  - WhatsApp: *negrita*, _cursiva_ y ~tachado~, que WhatsApp pinta solo,
 *  - Unicode: 𝗻𝗲𝗴𝗿𝗶𝘁𝗮 y 𝘤𝘶𝘳𝘴𝘪𝘷𝘢 con letras especiales, para Instagram o LinkedIn,
 *    que no tienen formato. Los hashtags, menciones y links quedan normales para que sigan funcionando.
 *
 * No depende de tiptap ni del navegador: trabaja sobre el JSON.
 */

export type DocNode = {
  type: string;
  text?: string;
  marks?: { type: string }[];
  attrs?: Record<string, unknown>;
  content?: DocNode[];
};

type Inline = (text: string, marks: Set<string>) => string;

function inlineText(nodes: DocNode[] = [], inline: Inline) {
  return nodes
    .map((n) => (n.type === "text" ? inline(n.text ?? "", new Set((n.marks ?? []).map((m) => m.type))) : n.type === "hardBreak" ? "\n" : ""))
    .join("");
}

/** Una línea por párrafo; las listas con su viñeta o número, y lo anidado con sangría. */
function lines(nodes: DocNode[] = [], inline: Inline, indent = ""): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === "paragraph" || node.type === "heading") {
      out.push(indent + inlineText(node.content, inline));
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      let n = Number(node.attrs?.start ?? 1) || 1;
      for (const item of node.content ?? []) {
        const marker = node.type === "bulletList" ? "• " : `${n++}. `;
        const pad = indent + " ".repeat(marker.length);
        const inner = lines(item.content, inline, pad);
        if (inner.length) inner[0] = indent + marker + inner[0].slice(pad.length);
        else inner.push(indent + marker.trimEnd());
        out.push(...inner);
      }
    } else if (node.content) {
      out.push(...lines(node.content, inline, indent));
    }
  }
  return out;
}

const serialize = (doc: DocNode, inline: Inline) => lines(doc.content, inline).join("\n");

export const docToPlain = (doc: DocNode) => serialize(doc, (text) => text);

/** WhatsApp solo reconoce los signos pegados a la palabra: "*hola*", no "* hola *". */
export function docToWhatsApp(doc: DocNode) {
  return serialize(doc, (text, marks) => {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
    let core = m[2];
    if (!core) return text;
    if (marks.has("bold")) core = `*${core}*`;
    if (marks.has("italic")) core = `_${core}_`;
    if (marks.has("strike")) core = `~${core}~`;
    return m[1] + core + m[3];
  });
}

/** Comienzo de A, a y 0 en cada alfabeto matemático sans-serif de Unicode. */
const ALPHABETS = {
  bold: { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec },
  italic: { upper: 0x1d608, lower: 0x1d622, digit: 0 },
  boldItalic: { upper: 0x1d63c, lower: 0x1d656, digit: 0x1d7ec },
};

/** Lo que tiene que seguir siendo texto común para funcionar: hashtags, menciones y links. */
const KEEP = /(#[\p{L}\p{N}_]+|@[\p{L}\p{N}_.]+|https?:\/\/\S+|www\.\S+)/u;

function restyle(text: string, alphabet: (typeof ALPHABETS)[keyof typeof ALPHABETS]) {
  // Las letras con tilde se separan (á = a + ´): la letra cambia y la tilde queda encima.
  return [...text.normalize("NFD")]
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      if (c >= 65 && c <= 90) return String.fromCodePoint(alphabet.upper + c - 65);
      if (c >= 97 && c <= 122) return String.fromCodePoint(alphabet.lower + c - 97);
      if (alphabet.digit && c >= 48 && c <= 57) return String.fromCodePoint(alphabet.digit + c - 48);
      return ch;
    })
    .join("")
    .normalize("NFC");
}

const strike = (text: string) => [...text].map((ch) => (/\s/.test(ch) ? ch : `${ch}̶`)).join("");

export function docToUnicode(doc: DocNode) {
  return serialize(doc, (text, marks) => {
    const bold = marks.has("bold");
    const italic = marks.has("italic");
    if (!bold && !italic && !marks.has("strike")) return text;
    return text
      .split(KEEP)
      .map((part, i) => {
        if (i % 2 === 1 || !part) return part;
        let out = bold || italic ? restyle(part, ALPHABETS[bold && italic ? "boldItalic" : bold ? "bold" : "italic"]) : part;
        if (marks.has("strike")) out = strike(out);
        return out;
      })
      .join("");
  });
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Texto plano → HTML del editor (un párrafo por línea). Para las redacciones de antes del formato. */
export function textToHtml(text: string) {
  return text
    .split("\n")
    .map((line) => (line ? `<p>${escape(line)}</p>` : "<p></p>"))
    .join("");
}

/** ¿Tiene algo que no sea texto común (negrita, listas…)? */
export function hasFormatting(doc: DocNode): boolean {
  return (doc.content ?? []).some(
    (n) => n.type !== "paragraph" || (n.content ?? []).some((t) => (t.marks ?? []).length > 0)
  );
}
