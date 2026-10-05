// Compartido entre el script que precalcula los embeddings y la ruta de búsqueda:
// los dos tienen que describir cada emoji exactamente igual.

export const EMBEDDING_MODEL = "text-embedding-3-small";
/** Recortado (Matryoshka): conserva casi toda la calidad con un índice cuatro veces más chico. */
export const EMBEDDING_DIMS = 512;

/**
 * Texto que representa a un emoji: nombre y etiquetas en español e inglés, más
 * su grupo. Mezclar idiomas hace que "fiesta" y "party" caigan cerca.
 *
 * @param {{ n: string, e: string, t: string[], u: string[] }} emoji
 * @param {string} [group]
 * @param {string} [subgroup]
 */
export function embeddingText(emoji, group, subgroup) {
  return [
    emoji.n,
    emoji.e,
    emoji.t.join(", "),
    emoji.u.join(", "),
    [group, subgroup].filter(Boolean).join(" / "),
  ]
    .filter(Boolean)
    .join(". ");
}
