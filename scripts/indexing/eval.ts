/**
 * Retrieval quality baseline: embeds each query in src/lib/indexing/eval-queries.json,
 * searches the Qdrant alias and reports precision@k per attribute.
 *
 * Usage: npm run index:eval [-- --k 10] [-- --out data/eval/latest.json]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

import { QdrantClient } from "@qdrant/js-client-rest";

import { CLIP_DTYPE, CLIP_MODEL_ID } from "../../src/lib/clip/config.ts";
import { embedTexts } from "../../src/lib/clip/node.ts";
import type { CatalogItem } from "../../src/lib/indexing/catalog.ts";
import {
  type EvalQuery,
  type QueryScore,
  scoreQuery,
  summarize,
} from "../../src/lib/indexing/eval.ts";
import { DATA_DIR } from "../../src/lib/indexing/paths.ts";

const { values: args } = parseArgs({
  options: {
    k: { type: "string", default: "10" },
    out: { type: "string", default: join(DATA_DIR, "eval", "latest.json") },
  },
});
const k = Number(args.k);

const url = process.env.QDRANT_URL;
const alias = process.env.QDRANT_COLLECTION || "products";
if (!url)
  throw new Error(
    "QDRANT_URL is not set. Run `npm run setup` or pass it in the environment.",
  );
const client = new QdrantClient({
  url,
  apiKey: process.env.QDRANT_API_KEY || undefined,
});

const queries = JSON.parse(
  await readFile(
    new URL("../../src/lib/indexing/eval-queries.json", import.meta.url),
    "utf8",
  ),
) as EvalQuery[];
const vectors = await embedTexts(queries.map((q) => q.query));

const results: { query: string; score: QueryScore; top: string[] }[] = [];
for (const [index, { query, expect }] of queries.entries()) {
  const { points } = await client.query(alias, {
    query: Array.from(vectors[index]),
    limit: k,
    with_payload: true,
  });
  const items = points.map((point) => point.payload as CatalogItem);
  results.push({
    query,
    score: scoreQuery(expect, items, k),
    top: items
      .slice(0, 3)
      .map((item) => `${item.name} [${item.articleType}, ${item.baseColour}]`),
  });
}

const percent = (value?: number) =>
  value === undefined ? "  -" : `${Math.round(value * 100)}%`.padStart(4);
console.log(
  `\nPrecision@${k} on "${alias}" (${CLIP_MODEL_ID}, ${CLIP_DTYPE})\n`,
);
console.log(`${"query".padEnd(36)} type colour gender  all`);
for (const { query, score } of results) {
  console.log(
    `${query.padEnd(36)} ${percent(score.articleType)}   ${percent(score.baseColour)}   ${percent(score.gender)} ${percent(score.all)}`,
  );
}
const summary = summarize(results.map((r) => r.score));
console.log(
  `${"MEAN".padEnd(36)} ${percent(summary.articleType)}   ${percent(summary.baseColour)}   ${percent(summary.gender)} ${percent(summary.all)}`,
);

await mkdir(dirname(args.out), { recursive: true });
await writeFile(
  args.out,
  JSON.stringify(
    { model: CLIP_MODEL_ID, dtype: CLIP_DTYPE, alias, k, summary, results },
    null,
    2,
  ) + "\n",
);
console.log(`\nReport: ${args.out}`);
