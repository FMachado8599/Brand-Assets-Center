// Genera data/emojis/catalog.json: el catálogo de emojis que usa el módulo Emojis.
//
// Cruza tres fuentes:
//   - storage-ids.json: los emojis que tienen PNG en Firebase Storage (solo esos se muestran).
//   - emoji-datasource: el código "unified" con FE0F, que coincide con el nombre del archivo,
//     y las variantes de tono de piel.
//   - emojibase-data: nombres y etiquetas en español e inglés, y los grupos/subgrupos traducidos.
//   - broken-ids.json: imágenes de Storage que salieron mal en el proyecto anterior (un "?", el
//     emoji partido en dos, recortado). Se detectaron comparando contra las imágenes oficiales
//     de Apple de emoji-datasource-apple; esos emojis no se muestran.
//
// Uso: node scripts/emojis/build-catalog.mjs

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const datasource = require("emoji-datasource/emoji.json");
const baseEs = require("emojibase-data/es/data.json");
const baseEn = require("emojibase-data/en/data.json");
const messagesEs = require("emojibase-data/es/messages.json");
const broken = new Set(JSON.parse(readFileSync(join(here, "broken-ids.json"), "utf8")));
const storage = new Set(
  JSON.parse(readFileSync(join(here, "storage-ids.json"), "utf8")).filter((id) => !broken.has(id))
);

const TONES = ["1F3FB", "1F3FC", "1F3FD", "1F3FE", "1F3FF"];
const COMPONENT_GROUP = 2; // tonos de piel y pelo sueltos: no son emojis para usar solos

/** Clave de cruce: mayúsculas y sin FE0F, que cada fuente pone o no según el caso. */
const key = (hex) =>
  String(hex || "")
    .toUpperCase()
    .split("-")
    .filter((p) => p && p !== "FE0F")
    .join("-");

/** El id del archivo en Storage para un código de emoji-datasource, si existe. */
function storageId(unified, nonQualified) {
  const candidates = [unified, nonQualified, key(unified)].filter(Boolean).map((c) => c.toLowerCase());
  return candidates.find((c) => storage.has(c)) ?? null;
}

const index = (list) => {
  const map = new Map();
  for (const e of list) {
    map.set(key(e.hexcode), e);
    for (const s of e.skins ?? []) map.set(key(s.hexcode), s);
  }
  return map;
};
const es = index(baseEs);
const en = index(baseEn);

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

// Para los pocos emojis que emojibase no tenga: categoría de emoji-datasource → grupo de emojibase.
const DATASOURCE_GROUP = {
  "Smileys & Emotion": "smileys-emotion",
  "People & Body": "people-body",
  "Animals & Nature": "animals-nature",
  "Food & Drink": "food-drink",
  "Travel & Places": "travel-places",
  Activities: "activities",
  Objects: "objects",
  Symbols: "symbols",
  Flags: "flags",
};
const groupByKey = new Map(messagesEs.groups.map((g) => [g.key, g.order]));
const subgroupByKey = new Map(messagesEs.subgroups.map((s) => [s.key, s.order]));

const emojis = [];
const missingMeta = [];
const usedIds = new Set();

for (const item of datasource) {
  if (item.category === "Component") continue;
  const id = storageId(item.unified, item.non_qualified);
  if (!id) continue;

  const metaEs = es.get(key(item.unified));
  const metaEn = en.get(key(item.unified));
  if (metaEs?.group === COMPONENT_GROUP) continue;

  const group = metaEs?.group ?? groupByKey.get(DATASOURCE_GROUP[item.category]);
  const subgroup = metaEs?.subgroup ?? subgroupByKey.get(item.subcategory);
  if (!metaEs) missingMeta.push(`${id} ${item.name}`);

  // Variantes por tono: "T" para una persona, "T-T" para emojis de dos personas con el mismo tono.
  let tones = null;
  if (item.skin_variations) {
    tones = TONES.map((t) => {
      const variant = item.skin_variations[t] ?? item.skin_variations[`${t}-${t}`];
      return variant ? storageId(variant.unified, variant.non_qualified) : null;
    });
    if (tones.every((t) => !t)) tones = null;
  }

  usedIds.add(id);
  tones?.forEach((t) => t && usedIds.add(t));

  emojis.push({
    i: id,
    c: metaEs?.emoji ?? metaEn?.emoji ?? item.unified.split("-").map((h) => String.fromCodePoint(parseInt(h, 16))).join(""),
    n: metaEs?.label ?? item.name.toLowerCase(),
    e: metaEn?.label ?? item.name.toLowerCase(),
    t: uniq(metaEs?.tags ?? []),
    u: uniq([...(metaEn?.tags ?? []), ...item.short_names.map((s) => s.replace(/_/g, " "))]),
    g: group ?? 7,
    s: subgroup ?? -1,
    o: metaEs?.order ?? 100000 + item.sort_order,
    ...(tones ? { k: tones } : {}),
  });
}

emojis.sort((a, b) => a.o - b.o);

const presentGroups = new Set(emojis.map((e) => e.g));
const presentSubgroups = new Set(emojis.map((e) => `${e.g}:${e.s}`));
const groups = messagesEs.groups
  .filter((g) => presentGroups.has(g.order))
  .map((g) => ({
    id: g.order,
    key: g.key,
    name: capitalize(g.message),
    subgroups: messagesEs.subgroups
      .filter((s) => presentSubgroups.has(`${g.order}:${s.order}`))
      .map((s) => ({ id: s.order, key: s.key, name: capitalize(s.message) })),
  }));

const catalog = {
  version: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  groups,
  emojis: emojis.map(({ o, ...rest }) => rest),
};

mkdirSync(join(root, "data", "emojis"), { recursive: true });
writeFileSync(join(root, "data", "emojis", "catalog.json"), JSON.stringify(catalog));

const orphan = [...storage].filter((id) => !usedIds.has(id));
console.log(`Emojis base: ${emojis.length}`);
console.log(`Con variantes de tono: ${emojis.filter((e) => e.k).length}`);
console.log(`Archivos en Storage usados: ${usedIds.size} de ${storage.size + broken.size} (${broken.size} rotos excluidos)`);
console.log(`Sin metadata en español (${missingMeta.length}):`, missingMeta.slice(0, 15));
console.log(`Archivos sin emoji en el catálogo (${orphan.length}):`, orphan.slice(0, 30));
