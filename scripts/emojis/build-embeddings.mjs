// Precalcula los embeddings de todos los emojis del catálogo y los guarda en
// data/emojis/embeddings.json (int8 + escala por vector, ~1 MB).
//
// Necesita OPENAI_API_KEY (lo lee de .env.local si no está en el entorno).
// Cuesta centavos: ~1900 textos cortos con text-embedding-3-small.
//
// Uso: npm run emojis:embeddings

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMBEDDING_DIMS, EMBEDDING_MODEL, embeddingText } from "../../lib/emojis/embedding-text.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const BATCH = 500;

function loadEnv() {
  if (process.env.OPENAI_API_KEY) return;
  const file = join(root, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function embed(input) {
  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input, dimensions: EMBEDDING_DIMS }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `OpenAI respondió ${res.status}`);
  return { vectors: body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding), tokens: body.usage?.total_tokens ?? 0 };
}

async function main() {
  loadEnv();
  if (!process.env.OPENAI_API_KEY) {
    console.error("Falta OPENAI_API_KEY (en el entorno o en .env.local).");
    process.exit(1);
  }

  const catalog = JSON.parse(readFileSync(join(root, "data", "emojis", "catalog.json"), "utf8"));
  const groups = new Map(catalog.groups.map((g) => [g.id, g]));
  const texts = catalog.emojis.map((e) => {
    const g = groups.get(e.g);
    return embeddingText(e, g?.name, g?.subgroups.find((s) => s.id === e.s)?.name);
  });

  const quantized = new Int8Array(texts.length * EMBEDDING_DIMS);
  const scales = [];
  let tokens = 0;

  for (let start = 0; start < texts.length; start += BATCH) {
    const { vectors, tokens: used } = await embed(texts.slice(start, start + BATCH));
    tokens += used;
    vectors.forEach((raw, j) => {
      const norm = Math.sqrt(raw.reduce((acc, x) => acc + x * x, 0)) || 1;
      const unit = raw.map((x) => x / norm);
      const maxAbs = Math.max(...unit.map(Math.abs)) || 1;
      const scale = 127 / maxAbs;
      scales.push(Number(scale.toFixed(4)));
      unit.forEach((x, d) => (quantized[(start + j) * EMBEDDING_DIMS + d] = Math.round(x * scale)));
    });
    console.log(`  ${Math.min(start + BATCH, texts.length)}/${texts.length}`);
  }

  const out = {
    model: EMBEDDING_MODEL,
    dims: EMBEDDING_DIMS,
    ids: catalog.emojis.map((e) => e.i),
    scales,
    vectors: Buffer.from(quantized.buffer).toString("base64"),
  };
  writeFileSync(join(root, "data", "emojis", "embeddings.json"), JSON.stringify(out));
  console.log(`Listo: ${texts.length} emojis, ${tokens} tokens (≈ US$ ${((tokens / 1e6) * 0.02).toFixed(4)}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
