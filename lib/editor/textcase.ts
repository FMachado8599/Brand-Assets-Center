const LETTER = /[\p{L}\p{N}]/u;
const APOSTROPHES = ["'", "\u2019"];

export type CaseMode = "upper" | "lower" | "title";

/**
 * Capitaliza cada palabra. `prev` es el carácter anterior en el documento,
 * para no cortar una palabra que arranca en otro fragmento con otro formato:
 * "**Mont**serrat" no debe volverse "MontSerrat".
 */
export function titleCase(text: string, prev: string) {
  let atBoundary = !LETTER.test(prev) && !APOSTROPHES.includes(prev);
  let out = "";
  for (const ch of text) {
    if (LETTER.test(ch)) {
      out += atBoundary ? ch.toUpperCase() : ch.toLowerCase();
      atBoundary = false;
    } else {
      out += ch;
      atBoundary = !APOSTROPHES.includes(ch);
    }
  }
  return out;
}

export function applyCase(text: string, mode: CaseMode, prev = "") {
  if (mode === "upper") return text.toUpperCase();
  if (mode === "lower") return text.toLowerCase();
  return titleCase(text, prev);
}
