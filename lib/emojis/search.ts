import { BY_ID, EMOJIS, ORDER } from "./catalog.server";
import type { EmojiEntry } from "./types";

/**
 * Búsqueda por palabras (servidor) sobre nombres y etiquetas en español e
 * inglés. Resuelve los casos exactos ("fuego", "ok", "corazón"); la búsqueda
 * por significado suma lo que no está en las etiquetas ("festejo" → 🎉) y las
 * dos se mezclan en rankIds.
 */

const STOP = new Set([
  "de", "del", "la", "el", "los", "las", "con", "y", "o", "a", "en", "un", "una", "para", "por", "que",
  "the", "of", "and", "with", "an", "to", "in", "for",
]);

export function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

type Prepared = { emoji: EmojiEntry; names: string[]; words: string[]; tags: string[]; vocab: string[] };

let prepared: Prepared[] | null = null;
function prepare() {
  prepared ??= EMOJIS.map((emoji) => {
    const names = [normalize(emoji.n), normalize(emoji.e)];
    const words = names.flatMap((n) => n.split(/[\s:,\-–]+/)).filter(Boolean);
    const tags = [...emoji.t, ...emoji.u].map(normalize);
    return {
      emoji,
      names,
      words,
      tags,
      // Palabras sueltas de nombres y etiquetas, para tolerar errores de tipeo.
      vocab: [...new Set([...words, ...tags.flatMap((t) => t.split(/[\s:,\-–]+/))])].filter((w) => w.length >= 3),
    };
  });
  return prepared;
}

/** Distancia entre dos palabras (letras cambiadas, de más, de menos o invertidas). Corta apenas pasa de `max`. */
function distance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

/**
 * Un error de tipeo no frena la búsqueda: "fuejo" encuentra 🔥 (fuego) y
 * "selbracion", 🎉. También a medio escribir: "fuej" se compara con "fueg…".
 * Desde 4 letras, con 1 error (2 desde 7 letras).
 */
function typoMatch(p: Prepared, token: string) {
  if (token.length < 4) return false;
  const max = token.length >= 7 ? 2 : 1;
  return p.vocab.some(
    (w) => distance(token, w, max) <= max || (w.length > token.length && distance(token, w.slice(0, token.length), 1) <= 1)
  );
}

function tokenScore(p: Prepared, token: string) {
  if (p.tags.includes(token)) return 60;
  if (p.words.includes(token)) return 55;
  if (p.words.some((w) => w.startsWith(token)) || p.tags.some((t) => t.startsWith(token))) return 35;
  if (token.length >= 3 && (p.names.some((n) => n.includes(token)) || p.tags.some((t) => t.includes(token)))) return 15;
  if (typoMatch(p, token)) return 10;
  return 0;
}

const stripVariation = (s: string) => s.replace(/️/g, "").trim();

/**
 * Los más usados según la lista de frecuencia de Unicode: a igual coincidencia
 * van primero, así "corazón" da ❤️ antes que 💘 y "risa" da 😂.
 */
const POPULAR = [..."😂❤🤣👍😭🙏😘🥰😍😊🎉😁💕🥺😅🔥☺🤦♥🤷🙄😆🤗😉🎂🤔👏🙂😳🥳😎👌💜😔💪✨💖👀😋😏😢👉💗😩💯🌹💞🎈💙😃😡💐😜🙈🤞😄🤤🙌🤪❣😀💋💀👇💔😌💓🤩🙃😬😱😴🤭😐🌞😒😇🌸😈🎶✌🎊🥵😞💚☀🖤💰😚👑🎁💥🙋☹😑🥴👈💩✅"];
const POPULAR_BONUS = new Map<string, number>();
POPULAR.forEach((char, rank) => {
  const emoji = EMOJIS.find((e) => stripVariation(e.c) === char);
  if (emoji && !POPULAR_BONUS.has(emoji.i)) POPULAR_BONUS.set(emoji.i, 20 * (1 - rank / POPULAR.length));
});

export function keywordScores(query: string): Map<string, number> {
  const scores = new Map<string, number>();
  const q = normalize(query);
  if (!q) return scores;

  // Si pegaron el emoji en sí, ese va primero.
  const pasted = stripVariation(query);
  for (const e of EMOJIS) if (stripVariation(e.c) === pasted) scores.set(e.i, 1000);

  const tokens = q.split(/\s+/).filter((t) => t && !STOP.has(t));
  if (!tokens.length) return scores;

  for (const p of prepare()) {
    let total = 0;
    for (const token of tokens) {
      const s = tokenScore(p, token);
      if (!s) {
        total = 0; // todas las palabras tienen que aparecer
        break;
      }
      total += s;
    }
    if (!total) continue;
    let score = total / tokens.length + (POPULAR_BONUS.get(p.emoji.i) ?? 0);
    if (p.names.includes(q)) score += 100;
    else if (p.names.some((n) => n.startsWith(q))) score += 30;
    scores.set(p.emoji.i, Math.max(scores.get(p.emoji.i) ?? 0, score));
  }
  return scores;
}

export type SemanticHit = { i: string; s: number };

/**
 * Mezcla ambas búsquedas y devuelve los ids ordenados. Del lado semántico
 * entra solo la franja de arriba (los que están cerca del mejor resultado),
 * así no se cuela ruido cuando la consulta tiene una respuesta obvia.
 */
export function rankIds(query: string, semantic: SemanticHit[] | null): string[] {
  const scores = keywordScores(query);

  if (semantic?.length) {
    const floor = Math.max(0.3, semantic[0].s - 0.12);
    let added = 0;
    for (const hit of semantic) {
      if (hit.s < floor || added >= 80) break;
      if (!BY_ID.has(hit.i)) continue;
      scores.set(hit.i, (scores.get(hit.i) ?? 0) + hit.s * 120);
      added++;
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (ORDER.get(a[0]) ?? 0) - (ORDER.get(b[0]) ?? 0))
    .map(([id]) => id)
    .filter((id) => BY_ID.has(id));
}
