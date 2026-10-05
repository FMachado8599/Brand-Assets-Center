import raw from "@/data/emojis/catalog.json";
import type { CategorySummary, EmojiEntry, EmojiGroup } from "./types";

/**
 * Catálogo completo (generado por scripts/emojis/build-catalog.mjs). Solo lo
 * importan las rutas del servidor: así los ~1850 emojis no viajan en el
 * JavaScript de la página, se piden de a páginas.
 */

const data = raw as unknown as { groups: EmojiGroup[]; emojis: EmojiEntry[] };

export const GROUPS = data.groups;
export const EMOJIS = data.emojis;
export const BY_ID = new Map(EMOJIS.map((e) => [e.i, e]));
/** Posición en el orden estándar: desempata resultados de búsqueda a favor de los más comunes. */
export const ORDER = new Map(EMOJIS.map((e, index) => [e.i, index]));

const BY_GROUP = new Map<number, EmojiEntry[]>();
for (const e of EMOJIS) BY_GROUP.set(e.g, [...(BY_GROUP.get(e.g) ?? []), e]);

export function categorySummaries(): CategorySummary[] {
  return GROUPS.map((g) => {
    const list = BY_GROUP.get(g.id) ?? [];
    return {
      id: g.id,
      key: g.key,
      name: g.name,
      count: list.length,
      // La portada es el primer emoji de la categoría, en el orden estándar.
      cover: { i: list[0]?.i ?? "", n: list[0]?.n ?? "" },
      subgroups: g.subgroups
        .map((s) => ({ ...s, count: list.filter((e) => e.s === s.id).length }))
        .filter((s) => s.count > 0),
    };
  }).filter((c) => c.count > 0);
}

export function listGroup(group: number, subgroup: number | null) {
  const list = BY_GROUP.get(group) ?? [];
  return subgroup === null ? list : list.filter((e) => e.s === subgroup);
}

export function paginate<T>(list: T[], cursor: number, limit: number) {
  return {
    items: list.slice(cursor, cursor + limit),
    nextCursor: cursor + limit < list.length ? cursor + limit : null,
    total: list.length,
  };
}
