import { promises as fs } from "node:fs";
import path from "node:path";
import catalog from "@/data/emojis/catalog.json";
import { EMBEDDING_DIMS, EMBEDDING_MODEL, embeddingText } from "./embedding-text.mjs";

/**
 * Búsqueda semántica de emojis, solo servidor. Cada emoji tiene un vector
 * (precalculado por scripts/emojis/build-embeddings.mjs); la consulta se
 * convierte en vector con OpenAI y se compara contra todos en memoria. Son
 * ~1900 vectores de 512 dimensiones: recorrerlos tarda milisegundos, no hace
 * falta una base vectorial.
 */

type Index = { ids: string[]; dims: number; vectors: Float32Array };
type Stored = { model: string; dims: number; ids: string[]; scales: number[]; vectors: string };

const INDEX_FILE = path.join(process.cwd(), "data", "emojis", "embeddings.json");
const BATCH = 500;

let indexPromise: Promise<Index> | null = null;
const queryCache = new Map<string, Float32Array>();

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getIndex(): Promise<Index> {
  indexPromise ??= loadIndex().catch((e) => {
    indexPromise = null; // que el próximo pedido reintente
    throw e;
  });
  return indexPromise;
}

async function loadIndex(): Promise<Index> {
  try {
    const stored = JSON.parse(await fs.readFile(INDEX_FILE, "utf8")) as Stored;
    if (stored.model === EMBEDDING_MODEL && stored.dims === EMBEDDING_DIMS) return decode(stored);
    console.warn("[emojis] embeddings.json es de otro modelo: se recalcula en memoria");
  } catch {
    console.warn("[emojis] Falta data/emojis/embeddings.json: se calcula en memoria. Corré `npm run emojis:embeddings` para evitarlo.");
  }
  return buildIndex();
}

/** Plan B si no se corrió el script: calcula todo en este proceso (una sola vez por instancia). */
async function buildIndex(): Promise<Index> {
  const groups = new Map(catalog.groups.map((g) => [g.id, g]));
  const texts = catalog.emojis.map((e) => {
    const g = groups.get(e.g);
    return embeddingText(e, g?.name, g?.subgroups.find((s) => s.id === e.s)?.name);
  });

  const vectors = new Float32Array(texts.length * EMBEDDING_DIMS);
  for (let start = 0; start < texts.length; start += BATCH) {
    const batch = await embed(texts.slice(start, start + BATCH));
    batch.forEach((v, j) => vectors.set(v, (start + j) * EMBEDDING_DIMS));
  }
  return { ids: catalog.emojis.map((e) => e.i), dims: EMBEDDING_DIMS, vectors };
}

/** El archivo guarda cada vector cuantizado a int8 con su escala: ~1 MB en lugar de ~4 MB. */
function decode(stored: Stored): Index {
  const bytes = Buffer.from(stored.vectors, "base64");
  const q = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vectors = new Float32Array(q.length);
  for (let i = 0; i < stored.ids.length; i++) {
    const scale = stored.scales[i];
    const offset = i * stored.dims;
    for (let d = 0; d < stored.dims; d++) vectors[offset + d] = q[offset + d] / scale;
  }
  return { ids: stored.ids, dims: stored.dims, vectors };
}

async function embed(input: string[]): Promise<Float32Array[]> {
  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input, dimensions: EMBEDDING_DIMS }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `OpenAI respondió ${res.status}`);
  return (body.data as { index: number; embedding: number[] }[])
    .sort((a, b) => a.index - b.index)
    .map((d) => normalize(Float32Array.from(d.embedding)));
}

function normalize(v: Float32Array) {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

export async function embedQuery(query: string): Promise<Float32Array> {
  const key = query.toLowerCase();
  const hit = queryCache.get(key);
  if (hit) return hit;
  const [vector] = await embed([query]);
  if (queryCache.size > 500) queryCache.delete(queryCache.keys().next().value!);
  queryCache.set(key, vector);
  return vector;
}

/** Similitud coseno contra todo el índice (los vectores ya están normalizados). */
export function topMatches(index: Index, query: Float32Array, limit: number) {
  const { ids, dims, vectors } = index;
  const scores = new Float32Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    let dot = 0;
    const offset = i * dims;
    for (let d = 0; d < dims; d++) dot += vectors[offset + d] * query[d];
    scores[i] = dot;
  }
  return Array.from(scores, (s, i) => ({ i: ids[i], s: Math.round(s * 1000) / 1000 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
}

/** Los emojis más cercanos en significado a la consulta (requiere OPENAI_API_KEY). */
export async function semanticHits(query: string, limit = 120) {
  const [index, vector] = await Promise.all([getIndex(), embedQuery(query)]);
  return topMatches(index, vector, limit);
}
