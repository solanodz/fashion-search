/**
 * Projects the catalog's CLIP image vectors to 2D with UMAP and writes the
 * map the UI draws (ADR 0010): public/embedding-map.bin + .json.
 * Deterministic for the same embeddings (seeded random).
 *
 * Usage: npm run index:map [-- --limit 3000]
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { UMAP } from "umap-js";

import {
  CLIP_DIMENSIONS,
  CLIP_DTYPE,
  CLIP_MODEL_ID,
} from "../../src/lib/clip/config.ts";
import type { CatalogItem } from "../../src/lib/indexing/catalog.ts";
import {
  encodeMap,
  MAP_FILES,
  type MapMeta,
  normalizePoints,
} from "../../src/lib/indexing/embedding-map.ts";
import { EmbeddingsStore } from "../../src/lib/indexing/embeddings-store.ts";
import { CATALOG_FILE, EMBEDDINGS_DIR } from "../../src/lib/indexing/paths.ts";

const { values: args } = parseArgs({
  options: { limit: { type: "string" } },
});

const catalog = new Map(
  (await readFile(CATALOG_FILE, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as CatalogItem)
    .map((item) => [item.id, item]),
);
const store = await EmbeddingsStore.open(EMBEDDINGS_DIR, {
  model: CLIP_MODEL_ID,
  dtype: CLIP_DTYPE,
  dimensions: CLIP_DIMENSIONS,
});
let rows = (await store.readAll()).filter(({ id }) => catalog.has(id));
if (args.limit) rows = rows.slice(0, Number(args.limit));

// Seeded so the same embeddings always give the same map.
let seed = 42;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

console.log(`→ UMAP on ${rows.length} vectors`);
const started = Date.now();
const umap = new UMAP({
  nComponents: 2,
  nNeighbors: 15,
  minDist: 0.1,
  random,
});
const points = await umap.fitAsync(
  rows.map((row) => Array.from(row.vector)),
  (epoch) => {
    if (epoch % 25 === 0) process.stdout.write(`\r→ epoch ${epoch}`);
  },
);
process.stdout.write("\n");

const items = rows.map(({ id }) => catalog.get(id)!);
const types = [...new Set(items.map((item) => item.articleType))].sort();
const typeIndex = new Map(types.map((type, i) => [type, i]));
const categories = Object.fromEntries(
  items.map((item) => [item.articleType, item.masterCategory]),
);

const bytes = encodeMap(
  rows.map(({ id }) => id),
  normalizePoints(points),
  items.map((item) => typeIndex.get(item.articleType)!),
);
const meta: MapMeta = {
  model: CLIP_MODEL_ID,
  dtype: CLIP_DTYPE,
  count: rows.length,
  types,
  categories,
};
await writeFile(join("public", MAP_FILES.points), bytes);
await writeFile(
  join("public", MAP_FILES.meta),
  JSON.stringify(meta, null, 2) + "\n",
);
console.log(
  `✓ ${rows.length} points → public/${MAP_FILES.points} (${(bytes.length / 1e3).toFixed(0)} KB) in ${((Date.now() - started) / 1000).toFixed(0)}s`,
);
