/**
 * Retrieval quality baseline: embeds each query in src/lib/indexing/eval-queries.json,
 * searches the Qdrant alias and reports precision@k per attribute.
 *
 * Usage: npm run index:eval [-- --k 10] [-- --mode hybrid|image]
 *        [-- --lang en|es] [-- --translate] [-- --out data/eval/latest.json]
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
import { queryKeywords } from "../../src/lib/search/keywords.ts";
import { runSearch } from "../../src/lib/search/query.ts";
import { translateQuery } from "../../src/lib/search/spanish.ts";

const { values: args } = parseArgs({
  options: {
    k: { type: "string", default: "10" },
    mode: { type: "string", default: "hybrid" },
    lang: { type: "string", default: "en" },
    translate: { type: "boolean", default: false },
    out: { type: "string", default: join(DATA_DIR, "eval", "latest.json") },
  },
});
const k = Number(args.k);
if (args.mode !== "hybrid" && args.mode !== "image") {
  throw new Error(`--mode must be "hybrid" or "image", got "${args.mode}"`);
}
if (args.lang !== "en" && args.lang !== "es") {
  throw new Error(`--lang must be "en" or "es"`);
}

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
// --translate rewrites Spanish queries in English with the glossary first.
const texts = queries.map((q) =>
  args.lang === "es"
    ? args.translate
      ? translateQuery(q.es).text
      : q.es
    : q.query,
);
const vectors = await embedTexts(texts);

const results: { query: string; score: QueryScore; top: string[] }[] = [];
for (const [index, { expect }] of queries.entries()) {
  const query = texts[index];
  const found = await runSearch(client, alias, {
    vector: Array.from(vectors[index]),
    filters: {},
    limit: k,
    keywords:
      args.mode === "hybrid" ? (queryKeywords(query) ?? undefined) : undefined,
  });
  const items: CatalogItem[] = found.map((result) => result.product);
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
  `\nPrecision@${k} on "${alias}" (${CLIP_MODEL_ID}, ${args.mode}, ${args.lang}${args.translate ? ", glossary" : ""})\n`,
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
    {
      model: CLIP_MODEL_ID,
      dtype: CLIP_DTYPE,
      mode: args.mode,
      lang: args.lang,
      translate: args.translate,
      alias,
      k,
      summary,
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nReport: ${args.out}`);
