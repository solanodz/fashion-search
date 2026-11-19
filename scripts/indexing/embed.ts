/**
 * Step 2 of the indexing pipeline: data/catalog.jsonl + data/images → data/embeddings.
 * Resumable: rerun after an interruption and it continues where it stopped.
 *
 * Usage: npm run index:embed [-- --batch 32] [-- --limit 500] [-- --fresh]
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import {
  CLIP_DIMENSIONS,
  CLIP_DTYPE,
  CLIP_MODEL_ID,
} from "../../src/lib/clip/config.ts";
import {
  embedImages,
  getVisionEncoder,
  readImageFile,
} from "../../src/lib/clip/node.ts";
import type { CatalogItem } from "../../src/lib/indexing/catalog.ts";
import { EmbeddingsStore } from "../../src/lib/indexing/embeddings-store.ts";
import {
  CATALOG_FILE,
  EMBEDDINGS_DIR,
  IMAGES_DIR,
} from "../../src/lib/indexing/paths.ts";

const { values: args } = parseArgs({
  options: {
    batch: { type: "string", default: "32" },
    limit: { type: "string" },
    fresh: { type: "boolean", default: false },
  },
});
const batchSize = Number(args.batch);
const limit = args.limit === undefined ? Infinity : Number(args.limit);

const catalog = (await readFile(CATALOG_FILE, "utf8"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as CatalogItem);

if (args.fresh) await EmbeddingsStore.remove(EMBEDDINGS_DIR);
const store = await EmbeddingsStore.open(EMBEDDINGS_DIR, {
  model: CLIP_MODEL_ID,
  dtype: CLIP_DTYPE,
  dimensions: CLIP_DIMENSIONS,
});

const done = new Set(await store.ids());
const pending = catalog.filter((item) => !done.has(item.id)).slice(0, limit);
console.log(
  `${done.size}/${catalog.length} products already embedded, ${pending.length} to go`,
);
if (pending.length === 0) process.exit(0);

console.log(`→ Loading ${CLIP_MODEL_ID} (${CLIP_DTYPE})…`);
await getVisionEncoder();

let stopping = false;
process.on("SIGINT", () => {
  if (stopping) process.exit(130);
  stopping = true;
  console.log("\nStopping after the current batch (Ctrl+C again to quit now)…");
});

const started = Date.now();
let processed = 0;

for (let start = 0; start < pending.length && !stopping; start += batchSize) {
  const batch = pending.slice(start, start + batchSize);
  const images = await Promise.all(
    batch.map((item) => readImageFile(join(IMAGES_DIR, `${item.id}.jpg`))),
  );
  const vectors = await embedImages(images);
  await store.append(
    batch.map((item) => item.id),
    vectors,
  );

  processed += batch.length;
  const seconds = (Date.now() - started) / 1000;
  const rate = processed / seconds;
  const eta = (pending.length - processed) / rate;
  process.stdout.write(
    `\r→ ${store.count}/${catalog.length} embedded · ${rate.toFixed(1)} img/s · ETA ${formatDuration(eta)}   `,
  );
}

const elapsed = (Date.now() - started) / 1000;
console.log(
  `\n✓ ${processed} products embedded in ${formatDuration(elapsed)} (${store.count}/${catalog.length} total)`,
);

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "…";
  const minutes = Math.floor(seconds / 60);
  return minutes > 0
    ? `${minutes}m ${Math.round(seconds % 60)}s`
    : `${Math.round(seconds)}s`;
}
