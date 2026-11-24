/**
 * Measures relevance feedback (ADR 0016) with a simulated shopper, on the
 * evaluation queries:
 * - "unstated": the query names only the type ("dresses"); the shopper also
 *   wants the colour and gender of the original query but never types them.
 * - "full": the original query, which already says everything. Feedback
 *   must not make a good search worse.
 * Each round the shopper likes the first result on the page that fits and
 * dislikes the first of the top 10 that doesn't. Reported: precision@10
 * (every expected attribute matches) before and after each round, for the
 * marked products only removed, the vectors alone, the fields alone and both.
 *
 * Usage: npm run index:feedback-eval [-- --rounds 3]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { QdrantClient } from "@qdrant/js-client-rest";

import { embedTexts } from "../../src/lib/clip/node.ts";
import type { CatalogItem } from "../../src/lib/indexing/catalog.ts";
import {
  EVAL_ATTRIBUTES,
  type EvalQuery,
} from "../../src/lib/indexing/eval.ts";
import { DATA_DIR } from "../../src/lib/indexing/paths.ts";
import { queryKeywords } from "../../src/lib/search/keywords.ts";
import { runSearch } from "../../src/lib/search/query.ts";

const { values: args } = parseArgs({
  options: { rounds: { type: "string", default: "3" } },
});
const rounds = Number(args.rounds);

/** Precision is measured on the first 10 of a page of 36, as the app shows. */
const K = 10;
const PAGE = 36;

const url = process.env.QDRANT_URL;
if (!url) throw new Error("QDRANT_URL is not set.");
const collection = process.env.QDRANT_COLLECTION || "products";
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

/** A product fits when every attribute the query expects matches. */
const fits = (expect: EvalQuery["expect"], item: CatalogItem) =>
  EVAL_ATTRIBUTES.filter((attribute) => expect[attribute]).every((attribute) =>
    expect[attribute]!.includes(item[attribute] ?? ""),
  );

/** How a shopper would type a catalog type. */
const typeWords = (type: string) =>
  type === "Tshirts" ? "t-shirts" : type.toLowerCase();

type Task = { text: string; expect: EvalQuery["expect"] };
const scenarios: Record<string, Task[]> = {
  unstated: queries
    .filter(
      ({ expect }) =>
        expect.articleType && (expect.baseColour || expect.gender),
    )
    .map(({ expect }) => ({ text: typeWords(expect.articleType![0]), expect })),
  full: queries.map(({ query, expect }) => ({ text: query, expect })),
};

const MODES = ["removed", "vectors", "fields", "both"] as const;
type Mode = (typeof MODES)[number];

async function page(
  task: Task,
  vector: Float32Array,
  like: number[],
  dislike: number[],
  mode: Mode,
): Promise<CatalogItem[]> {
  const marked = new Set([...like, ...dislike]);
  const found = await runSearch(client, collection, {
    vector: Array.from(vector),
    filters: {},
    // "removed" has no feedback: the marked products are dropped afterwards.
    limit: mode === "removed" ? PAGE + marked.size : PAGE,
    keywords: queryKeywords(task.text) ?? undefined,
    ...(mode === "removed" || marked.size === 0
      ? {}
      : { feedback: { like, dislike }, feedbackMode: mode }),
  });
  return found
    .map((result) => result.product)
    .filter((item) => !marked.has(item.id))
    .slice(0, PAGE);
}

const precision = (task: Task, items: CatalogItem[]) =>
  items.slice(0, K).filter((item) => fits(task.expect, item)).length / K;
const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`.padStart(6);

const report: Record<string, Record<Mode, number[]>> = {};
for (const [name, tasks] of Object.entries(scenarios)) {
  const vectors = await embedTexts(tasks.map((task) => task.text));
  report[name] = {} as Record<Mode, number[]>;
  console.log(
    `\n${name}: ${tasks.length} queries, precision@${K} before and after each round`,
  );
  for (const mode of MODES) {
    const byRound: number[][] = Array.from({ length: rounds + 1 }, () => []);
    for (const [index, task] of tasks.entries()) {
      const like: number[] = [];
      const dislike: number[] = [];
      let items = await page(task, vectors[index], like, dislike, mode);
      byRound[0].push(precision(task, items));
      for (let round = 1; round <= rounds; round++) {
        const good = items.find((item) => fits(task.expect, item));
        const bad = items.slice(0, K).find((item) => !fits(task.expect, item));
        if (good) like.push(good.id);
        if (bad) dislike.push(bad.id);
        items = await page(task, vectors[index], like, dislike, mode);
        byRound[round].push(precision(task, items));
      }
    }
    report[name][mode] = byRound.map(mean);
    console.log(`  ${mode.padEnd(8)} ${report[name][mode].map(pct).join(" ")}`);
  }
}

await mkdir(join(DATA_DIR, "eval"), { recursive: true });
await writeFile(
  join(DATA_DIR, "eval", "feedback.json"),
  `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), k: K, page: PAGE, rounds, report }, null, 2)}\n`,
);
console.log("\nWrote data/eval/feedback.json");
