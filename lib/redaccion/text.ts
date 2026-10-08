/**
 * Utilidades de texto de Redacción: hashtags, conteos, nombre automático y
 * los formatos de exportación.
 */

/** Un hashtag empieza donde no hay una letra antes ("mail#tag" no cuenta) y tiene al menos una letra. */
const HASHTAG = /(?<![\p{L}\p{N}_&#])#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu;
const MENTION = /(?<![\p{L}\p{N}_@.])@([\p{L}\p{N}_.]*[\p{L}\p{N}_])/gu;

/** Para buscar y comparar sin que importen mayúsculas ni tildes. */
export function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** "#Changan", "changan" o " #changan, " → "Changan" / "changan" (sin #). Vacío si no sirve como hashtag. */
export function cleanHashtag(raw: string) {
  const tag = raw.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
  return /\p{L}/u.test(tag) ? tag.slice(0, 60) : "";
}

/** Varios hashtags escritos de una ("#a #b, c"). */
export function parseHashtags(raw: string) {
  return uniqueTags(raw.split(/[\s,;]+/).map(cleanHashtag).filter(Boolean));
}

/** Instagram no distingue mayúsculas: #Changan y #changan son el mismo. Queda la primera forma. */
export function uniqueTags(tags: string[]) {
  const seen = new Set<string>();
  return tags.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractHashtags(text: string) {
  return uniqueTags([...text.matchAll(HASHTAG)].map((m) => m[1]));
}

/** Rangos de hashtags y menciones dentro de un tramo de texto (para pintarlos en el editor). */
export function tokenRanges(text: string) {
  const out: { from: number; to: number; kind: "hashtag" | "mention" }[] = [];
  for (const m of text.matchAll(HASHTAG)) out.push({ from: m.index!, to: m.index! + m[0].length, kind: "hashtag" });
  for (const m of text.matchAll(MENTION)) out.push({ from: m.index!, to: m.index! + m[0].length, kind: "mention" });
  return out;
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("es", { granularity: "grapheme" }) : null;

/** Caracteres como los cuenta una persona: un emoji con tono o una familia es uno solo. */
export function charCount(text: string) {
  if (!segmenter) return [...text].length;
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}

export function textStats(text: string) {
  return {
    chars: charCount(text),
    words: (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []).length,
    hashtags: extractHashtags(text).length,
  };
}

/** Instagram corta en 30 hashtags por publicación. */
export const MAX_HASHTAGS = 30;

export const DEFAULT_TITLE = "Nueva redacción";

/** Mientras no le pongas nombre, la redacción se llama como su primera línea (sin los hashtags). */
export function autoTitle(body: string) {
  for (const raw of body.split("\n")) {
    const line = raw.replace(HASHTAG, "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (line.length <= 60) return line;
    const cut = line.slice(0, 60);
    const space = cut.lastIndexOf(" ");
    return `${(space > 30 ? cut.slice(0, space) : cut).trimEnd()}…`;
  }
  return DEFAULT_TITLE;
}

/** El texto sin hashtags: para cuando van en el primer comentario. */
export function withoutHashtags(text: string) {
  return text
    .replace(HASHTAG, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function onlyHashtags(text: string) {
  return extractHashtags(text)
    .map((t) => `#${t}`)
    .join(" ");
}

/** Nombre de archivo seguro (sin barras ni caracteres que Windows no acepta). */
export function fileSafe(name: string) {
  return name.replace(/[\\/:*?"<>|#…]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "redaccion";
}

export function downloadText(text: string, name: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileSafe(name)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const dateFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });
const dateYearFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" });

/** "recién", "hace 5 min", "hace 3 h", "ayer", "hace 4 días", "7 oct". */
export function timeAgo(iso: string, now: number) {
  const then = new Date(iso);
  const diff = Math.max(0, now - then.getTime());
  if (diff < MINUTE) return "recién";
  if (diff < HOUR) return `hace ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `hace ${Math.floor(diff / HOUR)} h`;
  const days = Math.floor((startOfDay(now) - startOfDay(then.getTime())) / DAY);
  if (days <= 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return new Date(now).getFullYear() === then.getFullYear() ? dateFmt.format(then) : dateYearFmt.format(then);
}

function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const fullFmt = new Intl.DateTimeFormat("es", { dateStyle: "long", timeStyle: "short" });
export const fullDate = (iso: string) => fullFmt.format(new Date(iso));
