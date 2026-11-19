/**
 * Step 3 of the indexing pipeline: data/catalog.jsonl + data/embeddings → Qdrant.
 * Creates the next `<alias>_vN` collection, fills it, verifies the count, moves
 * the alias and keeps the previous version for rollback.
 *
 * Usage:
 *   npm run index:upload                        # local Qdrant from .env.local
 *   QDRANT_URL=… QDRANT_API_KEY=<write key> npm run index:upload -- --yes
 *
 * Writing to a non-local Qdrant requires --yes.
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { QdrantClient } from "@qdrant/js-client-rest";

import {
  CLIP_DIMENSIONS,
  CLIP_DTYPE,
  CLIP_MODEL_ID,
} from "../../src/lib/clip/config.ts";
import type { CatalogItem } from "../../src/lib/indexing/catalog.ts";
import {
  buildPoints,
  createCollection,
  nextCollectionName,
  pruneVersions,
  swapAlias,
  upsertPoints,
} from "../../src/lib/indexing/collection.ts";
import { EmbeddingsStore } from "../../src/lib/indexing/embeddings-store.ts";
import { CATALOG_FILE, EMBEDDINGS_DIR } from "../../src/lib/indexing/paths.ts";

const { values: args } = parseArgs({
  options: { yes: { type: "boolean", default: false } },
});

const url = process.env.QDRANT_URL;
const alias = process.env.QDRANT_COLLECTION || "products";
if (!url)
  throw new Error(
    "QDRANT_URL is not set. Run `npm run setup` or pass it in the environment.",
  );

const host = new URL(url).hostname;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
if (!isLocal && !args.yes) {
  console.error(`Refusing to write to ${host} without --yes.`);
  process.exit(1);
}

const catalog = (await readFile(CATALOG_FILE, "utf8"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as CatalogItem);
const store = await EmbeddingsStore.open(EMBEDDINGS_DIR, {
  model: CLIP_MODEL_ID,
  dtype: CLIP_DTYPE,
  dimensions: CLIP_DIMENSIONS,
});
const points = buildPoints(catalog, await store.readAll());

const client = new QdrantClient({
  url,
  apiKey: process.env.QDRANT_API_KEY || undefined,
});
const { collections } = await client.getCollections();
const collection = nextCollectionName(
  collections.map((c) => c.name),
  alias,
);

console.log(
  `→ ${host}: creating ${collection} (${CLIP_DIMENSIONS} dims, cosine)`,
);
await createCollection(client, collection, CLIP_DIMENSIONS);

const started = Date.now();
await upsertPoints(client, collection, points, {
  onProgress: (done) =>
    process.stdout.write(`\r→ Uploaded ${done}/${points.length} points`),
});
process.stdout.write("\n");

const { count } = await client.count(collection, { exact: true });
if (count !== points.length) {
  throw new Error(
    `${collection} has ${count} points, expected ${points.length}. Alias not moved.`,
  );
}

const previous = await swapAlias(client, alias, collection);
const deleted = await pruneVersions(client, alias, [
  collection,
  ...(previous ? [previous] : []),
]);

console.log(
  `✓ ${count} points in ${collection} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
);
console.log(
  `✓ Alias "${alias}" → ${collection}${previous ? ` (was ${previous}, kept for rollback)` : ""}`,
);
if (deleted.length > 0)
  console.log(`✓ Deleted old versions: ${deleted.join(", ")}`);
