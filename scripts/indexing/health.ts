/**
 * Catalog health (ADR 0015): tags every catalog product from its ten nearest
 * neighbours (the product itself excluded) and lists the ones whose type the
 * neighbours contradict, the most common confusions and an example of each.
 * Also reports how alike the closest pair of products is: whether any photo
 * is in the catalog twice.
 *
 * Writes the report to data/eval/health.json.
 *
 * Usage: npm run index:health
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { QdrantClient } from "@qdrant/js-client-rest";

import type { CatalogItem } from "../../src/lib/indexing/catalog.ts";
import { DATA_DIR } from "../../src/lib/indexing/paths.ts";
import { IMAGE_VECTOR } from "../../src/lib/search/query.ts";
import {
  CONTRADICTION_SHARE,
  contradictedType,
} from "../../src/lib/tagging/health.ts";
import { VOTERS } from "../../src/lib/tagging/suggest.ts";

const BATCH = 200;
/** Confusions listed, and how many of them get an example. */
const CONFUSIONS = 8;
const EXAMPLES = 6;
/** Pairs at or above these similarities are counted. */
const PAIR_LEVELS = [0.99, 0.98, 0.97];

const url = process.env.QDRANT_URL;
if (!url) throw new Error("QDRANT_URL is not set.");
const collection = process.env.QDRANT_COLLECTION || "products";
const client = new QdrantClient({
  url,
  apiKey: process.env.QDRANT_API_KEY || undefined,
});

const catalog: CatalogItem[] = (
  await readFile(join(DATA_DIR, "catalog.jsonl"), "utf8")
)
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const byId = new Map(catalog.map((item) => [item.id, item]));

type Flagged = {
  id: number;
  name: string;
  label: string;
  looksLike: string;
  share: number;
  /** Similarity of its closest neighbour: how typical it looks. */
  closest: number;
};
const flagged: Flagged[] = [];
const pairs = new Map<string, number>();

for (let start = 0; start < catalog.length; start += BATCH) {
  const batch = catalog.slice(start, start + BATCH);
  // A query by id leaves the product itself out.
  const responses = await client.queryBatch(collection, {
    searches: batch.map((item) => ({
      query: item.id,
      using: IMAGE_VECTOR,
      limit: VOTERS,
      with_payload: false,
    })),
  });
  responses.forEach((response, index) => {
    const item = batch[index];
    const neighbours = response.points.map((point) => ({
      score: point.score,
      product: byId.get(Number(point.id)) ?? {},
    }));
    for (const point of response.points) {
      if (point.score < PAIR_LEVELS.at(-1)!) continue;
      const other = Number(point.id);
      pairs.set(
        item.id < other ? `${item.id}-${other}` : `${other}-${item.id}`,
        point.score,
      );
    }
    const contradiction = contradictedType(item, neighbours);
    if (contradiction) {
      flagged.push({
        id: item.id,
        name: item.name,
        label: item.articleType,
        ...contradiction,
        closest: response.points[0]?.score ?? 0,
      });
    }
  });
  process.stdout.write(
    `\rproducts ${Math.min(start + BATCH, catalog.length)}/${catalog.length}`,
  );
}
process.stdout.write("\n");

const counts = new Map<string, number>();
for (const { label, looksLike } of flagged) {
  const key = `${label}\t${looksLike}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
const confusions = [...counts]
  .sort((a, b) => b[1] - a[1])
  .slice(0, CONFUSIONS)
  .map(([key, products]) => {
    const [label, looksLike] = key.split("\t");
    return { label, looksLike, products };
  });
// One example per confusion: the product that looks most like its neighbours.
const examples = confusions.slice(0, EXAMPLES).map(({ label, looksLike }) => {
  const [best] = flagged
    .filter((f) => f.label === label && f.looksLike === looksLike)
    .sort((a, b) => b.share - a.share || b.closest - a.closest);
  return {
    id: best.id,
    name: best.name,
    label,
    looksLike,
    share: Math.round(best.share * 100) / 100,
  };
});

const scores = [...pairs.values()];
const summary = {
  date: new Date().toISOString().slice(0, 10),
  products: catalog.length,
  voters: VOTERS,
  labels: {
    share: CONTRADICTION_SHARE,
    flagged: flagged.length,
    confusions,
    examples,
  },
  pairs: {
    closest: Math.floor(Math.max(...scores) * 1000) / 1000,
    levels: PAIR_LEVELS.map((level) => ({
      similarity: level,
      pairs: scores.filter((score) => score >= level).length,
    })),
  },
};

console.log(
  `\n${flagged.length} of ${catalog.length} products (${((flagged.length / catalog.length) * 100).toFixed(1)}%) have a type that at least ${CONTRADICTION_SHARE * 100}% of the vote contradicts.`,
);
for (const { label, looksLike, products } of confusions) {
  console.log(`  ${label} → ${looksLike}: ${products}`);
}
console.log(`Closest pair of products: ${summary.pairs.closest}`);
for (const { similarity, pairs: count } of summary.pairs.levels) {
  console.log(`  pairs at ${similarity} or more: ${count}`);
}

await mkdir(join(DATA_DIR, "eval"), { recursive: true });
await writeFile(
  join(DATA_DIR, "eval", "health.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log("\nWrote data/eval/health.json");
