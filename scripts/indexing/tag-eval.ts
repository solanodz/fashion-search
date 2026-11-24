/**
 * Measures the photo auto-tagging (ADR 0015) by leaving one product out at a
 * time: a sample of catalog products is tagged from its nearest neighbours
 * (the product itself excluded) and the suggestions are compared with the
 * product's own labels. Also reports:
 * - the harder case where near-identical products (the same item in another
 *   colour, or listed twice) are excluded;
 * - the share of the most common value of each field, as a baseline;
 * - the colour vote by CLIP similarity alone against the vote weighted by
 *   colour histograms;
 * - how accuracy grows when only confident suggestions are kept.
 *
 * Usage: npm run index:tag-eval [-- --sample 2000]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { QdrantClient } from "@qdrant/js-client-rest";

import { RawImage } from "../../src/lib/clip/node.ts";
import type { CatalogItem } from "../../src/lib/indexing/catalog.ts";
import { DATA_DIR, IMAGES_DIR } from "../../src/lib/indexing/paths.ts";
import { IMAGE_VECTOR } from "../../src/lib/search/query.ts";
import {
  colourHistogram,
  HISTOGRAM_HEIGHT,
  HISTOGRAM_WIDTH,
  histogramSimilarity,
} from "../../src/lib/tagging/colour.ts";
import {
  COLOUR_TEMPERATURE,
  COLOUR_VOTERS,
  CONFIDENT,
  type Neighbour,
  suggestTags,
  TAG_FIELDS,
  type TagField,
  VOTE_TEMPERATURE,
  VOTERS,
} from "../../src/lib/tagging/suggest.ts";

const { values: args } = parseArgs({
  options: { sample: { type: "string", default: "2000" } },
});
const sampleSize = Number(args.sample);

/** Neighbours fetched per product: enough to vote after dropping variants. */
const FETCH = 60;
/** At or above this similarity a neighbour counts as the same item. */
const VARIANT_SCORE = 0.95;
const BATCH = 100;

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

// Deterministic sample: every n-th product.
const step = Math.max(1, Math.floor(catalog.length / sampleSize));
const sample = catalog.filter((_, i) => i % step === 0);

/** Share of the most common value of each field: what guessing it scores. */
const baseline = Object.fromEntries(
  TAG_FIELDS.map((field) => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const item of catalog) {
      const value = item[field];
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
      total++;
    }
    const [value, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
    return [field, { value, share: count / total }];
  }),
) as Record<TagField, { value: string; share: number }>;

/** Colour histogram of a catalog photo, as the browser computes it. */
const histograms = new Map<number, Float32Array>();
async function histogramOf(id: number): Promise<Float32Array> {
  let histogram = histograms.get(id);
  if (!histogram) {
    const photo = await RawImage.read(join(IMAGES_DIR, `${id}.jpg`));
    const small = await photo.resize(HISTOGRAM_WIDTH, HISTOGRAM_HEIGHT);
    histogram = colourHistogram(
      small.data,
      small.width,
      small.height,
      small.channels,
    );
    histograms.set(id, histogram);
  }
  return histogram;
}

// Nearest neighbours of every sampled product, with how alike their colours
// are. A query by id leaves the product itself out.
const neighbours = new Map<number, Neighbour[]>();
for (let start = 0; start < sample.length; start += BATCH) {
  const batch = sample.slice(start, start + BATCH);
  const responses = await client.queryBatch(collection, {
    searches: batch.map((item) => ({
      query: item.id,
      using: IMAGE_VECTOR,
      limit: FETCH,
      with_payload: [...TAG_FIELDS],
    })),
  });
  for (const [index, response] of responses.entries()) {
    const own = await histogramOf(batch[index].id);
    const found: Neighbour[] = [];
    for (const point of response.points) {
      found.push({
        score: point.score,
        product: point.payload as Neighbour["product"],
        colourSimilarity: histogramSimilarity(
          own,
          await histogramOf(Number(point.id)),
        ),
      });
    }
    neighbours.set(batch[index].id, found);
  }
  process.stdout.write(`\rneighbours ${start + batch.length}/${sample.length}`);
}
process.stdout.write("\n");

type Setting = Parameters<typeof suggestTags>[1];
type Subset = (index: number) => boolean;
const everything: Subset = () => true;

/** Accuracy per field of one voting setting, over (part of) the sample. */
function accuracy(
  setting: Setting,
  {
    withoutVariants = false,
    withColour = true,
    subset = everything,
  }: { withoutVariants?: boolean; withColour?: boolean; subset?: Subset } = {},
) {
  const right = Object.fromEntries(TAG_FIELDS.map((f) => [f, 0]));
  const judged = Object.fromEntries(TAG_FIELDS.map((f) => [f, 0]));
  sample.forEach((item, index) => {
    if (!subset(index)) return;
    let voters = neighbours.get(item.id)!;
    if (withoutVariants) voters = voters.filter((n) => n.score < VARIANT_SCORE);
    if (!withColour) {
      voters = voters.map(({ score, product }) => ({ score, product }));
    }
    const suggestions = suggestTags(voters, setting);
    for (const field of TAG_FIELDS) {
      if (!item[field]) continue;
      judged[field]++;
      if (suggestions[field]?.value === item[field]) right[field]++;
    }
  });
  return Object.fromEntries(
    TAG_FIELDS.map((f) => [f, right[f] / judged[f]]),
  ) as Record<TagField, number>;
}

const mean = (scores: Record<TagField, number>) =>
  TAG_FIELDS.reduce((sum, f) => sum + scores[f], 0) / TAG_FIELDS.length;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

// 1. Which voting setting? Compared on the harder case, where it matters.
const grid = [1, 3, 5, 10, 20].flatMap((voters) =>
  [null, 0.05, 0.02, 0.01].map((temperature) => ({ voters, temperature })),
);
const ranked = grid
  .map((setting) => ({
    setting,
    plain: mean(accuracy(setting)),
    hard: mean(accuracy(setting, { withoutVariants: true })),
  }))
  .sort((a, b) => b.hard - a.hard);
console.log(
  `\nVoting settings on ${sample.length} products, by mean accuracy without variants:`,
);
for (const { setting, plain, hard } of ranked.slice(0, 6)) {
  console.log(
    `  voters ${String(setting.voters).padStart(2)}  temperature ${String(setting.temperature ?? "none").padStart(4)}  →  ${pct(hard)} without variants, ${pct(plain)} with`,
  );
}

// 2. The colour vote: tuned on the even half of the sample, checked on the odd.
const even: Subset = (index) => index % 2 === 0;
const odd: Subset = (index) => index % 2 === 1;
const colourGrid = [10, 30, 60].flatMap((colourVoters) =>
  [0.2, 0.1, 0.05].map((colourTemperature) => ({
    colourVoters,
    colourTemperature,
  })),
);
const colourRanked = colourGrid
  .map((setting) => ({
    setting,
    tuned: accuracy(setting, { subset: even }).baseColour,
    heldOut: accuracy(setting, { subset: odd }).baseColour,
  }))
  .sort((a, b) => b.tuned - a.tuned);
console.log("\nColour vote weighted by colour histograms:");
for (const { setting, tuned, heldOut } of colourRanked.slice(0, 5)) {
  console.log(
    `  voters ${String(setting.colourVoters).padStart(2)}  temperature ${String(setting.colourTemperature).padStart(4)}  →  ${pct(tuned)} on the tuning half, ${pct(heldOut)} on the other`,
  );
}

// 3. The setting in the code, field by field.
const chosen = {
  voters: VOTERS,
  temperature: VOTE_TEMPERATURE,
  colourVoters: COLOUR_VOTERS,
  colourTemperature: COLOUR_TEMPERATURE,
};
const plain = accuracy(chosen);
const hard = accuracy(chosen, { withoutVariants: true });
const colourByShape = accuracy(chosen, { withColour: false }).baseColour;
console.log(
  `\nChosen: ${chosen.voters} voters at temperature ${chosen.temperature}; colour: ${chosen.colourVoters} voters at ${chosen.colourTemperature}`,
);
console.log(
  "  field            all neighbours   without variants   most common value",
);
for (const field of TAG_FIELDS) {
  console.log(
    `  ${field.padEnd(16)} ${pct(plain[field]).padStart(14)} ${pct(hard[field]).padStart(18)}   ${pct(baseline[field].share)} (${baseline[field].value})`,
  );
}
console.log(
  `  baseColour voted by CLIP similarity alone: ${pct(colourByShape)}`,
);

// 4. Keeping only confident suggestions: how many, and how often right.
const confident = Object.fromEntries(
  TAG_FIELDS.map((field) => {
    let kept = 0;
    let right = 0;
    let judged = 0;
    for (const item of sample) {
      if (!item[field]) continue;
      judged++;
      const suggestion = suggestTags(neighbours.get(item.id)!, chosen)[field];
      if (!suggestion || suggestion.confidence < CONFIDENT) continue;
      kept++;
      if (suggestion.value === item[field]) right++;
    }
    return [field, { coverage: kept / judged, accuracy: right / kept }];
  }),
) as Record<TagField, { coverage: number; accuracy: number }>;
console.log(`\nSuggestions with at least ${pct(CONFIDENT)} of the vote:`);
for (const field of TAG_FIELDS) {
  console.log(
    `  ${field.padEnd(16)} ${pct(confident[field].coverage).padStart(7)} of products, ${pct(confident[field].accuracy)} right`,
  );
}

await mkdir(join(DATA_DIR, "eval"), { recursive: true });
await writeFile(
  join(DATA_DIR, "eval", "tagging.json"),
  JSON.stringify(
    {
      date: new Date().toISOString().slice(0, 10),
      sample: sample.length,
      variantScore: VARIANT_SCORE,
      chosen,
      accuracy: { plain, withoutVariants: hard, colourByShape },
      baseline,
      confident: { threshold: CONFIDENT, fields: confident },
      settings: ranked.map(({ setting, plain: p, hard: h }) => ({
        ...setting,
        mean: p,
        meanWithoutVariants: h,
      })),
      colourSettings: colourRanked.map(({ setting, tuned, heldOut }) => ({
        ...setting,
        tuned,
        heldOut,
      })),
    },
    null,
    2,
  ),
);

console.log("\nWrote data/eval/tagging.json");
