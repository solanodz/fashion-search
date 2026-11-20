/**
 * Measures the outfit search (ADR 0013) on catalog photos of people wearing
 * the product: each photo is segmented, the product's garment is cut out and
 * searched, and the top 10 are judged against the product's own labels. The
 * whole photo, searched with the same filter, is the baseline.
 *
 * Usage: npm run index:outfit-eval [-- --per-type 15] [-- --save data/eval/cutouts]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { pipeline } from "@huggingface/transformers";
import { QdrantClient } from "@qdrant/js-client-rest";

import { embedImages, RawImage } from "../../src/lib/clip/node.ts";
import type { CatalogItem } from "../../src/lib/indexing/catalog.ts";
import { DATA_DIR } from "../../src/lib/indexing/paths.ts";
import {
  cutOut,
  GARMENTS,
  garmentRegions,
  type LabelMask,
} from "../../src/lib/outfit/garments.ts";
import {
  SEGMENTER_DTYPE,
  SEGMENTER_MODEL_ID,
} from "../../src/lib/outfit/config.ts";
import { runSearch } from "../../src/lib/search/query.ts";

const { values: args } = parseArgs({
  options: {
    "per-type": { type: "string", default: "15" },
    save: { type: "string" },
  },
});
const perType = Number(args["per-type"]);

/** Article types usually photographed on a person, and their garment. */
const TYPES: Record<string, string> = {
  Tshirts: "top",
  Shirts: "top",
  Tops: "top",
  Dresses: "dress",
  Jeans: "bottom",
  Trousers: "bottom",
  Skirts: "bottom",
  Shorts: "bottom",
};

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

/** Deterministic sample: every n-th product of each type. */
function sample(type: string): CatalogItem[] {
  const items = catalog.filter((item) => item.articleType === type);
  const step = Math.max(1, Math.floor(items.length / perType));
  return items.filter((_, i) => i % step === 0).slice(0, perType);
}

const segment = await pipeline("image-segmentation", SEGMENTER_MODEL_ID, {
  dtype: SEGMENTER_DTYPE,
});
if (args.save) await mkdir(args.save, { recursive: true });

type Score = { self: number; type: number; colour: number };
const totals = {
  photos: 0,
  found: 0,
  cutout: { self: 0, type: 0, colour: 0 },
  whole: { self: 0, type: 0, colour: 0 },
};
const byType: Record<string, typeof totals> = {};

async function judge(
  vector: Float32Array,
  item: CatalogItem,
  filters: object,
): Promise<Score> {
  const results = await runSearch(client, collection, {
    vector: Array.from(vector),
    filters,
    limit: 11,
  });
  // The product's own photo is judged separately; it would count as a hit.
  const others = results.filter((r) => r.id !== item.id).slice(0, 10);
  const share = (match: (r: CatalogItem) => boolean) =>
    others.filter((r) => match(r.product)).length / others.length;
  return {
    self: results.findIndex((r) => r.id === item.id) !== -1 ? 1 : 0,
    type: share((p) => p.articleType === item.articleType),
    colour: share((p) => p.baseColour === item.baseColour),
  };
}

const add = (into: Score, score: Score) => {
  into.self += score.self;
  into.type += score.type;
  into.colour += score.colour;
};

for (const [type, key] of Object.entries(TYPES)) {
  const garment = GARMENTS.find((g) => g.key === key)!;
  const t = (byType[type] = {
    photos: 0,
    found: 0,
    cutout: { self: 0, type: 0, colour: 0 },
    whole: { self: 0, type: 0, colour: 0 },
  });
  for (const item of sample(type)) {
    const image = await RawImage.read(
      join(DATA_DIR, "images", `${item.id}.jpg`),
    );
    const segments = (await segment(image)) as unknown as {
      label: string;
      mask: RawImage;
    }[];
    const masks: LabelMask[] = segments.map((s) => ({
      label: s.label,
      mask: s.mask.data,
    }));
    const region = garmentRegions(masks, image.width, image.height).find(
      (r) => r.garment.key === key,
    );
    t.photos++;
    totals.photos++;
    const [whole] = await embedImages([image]);
    const wholeScore = await judge(whole, item, garment.filters);
    add(t.whole, wholeScore);
    add(totals.whole, wholeScore);
    if (!region) continue;
    t.found++;
    totals.found++;
    const cut = cutOut(
      image.data,
      image.width,
      image.height,
      image.channels,
      region,
    );
    const cutImage = new RawImage(cut.data, cut.width, cut.height, 3);
    if (args.save)
      await cutImage.save(join(args.save, `${item.id}-${key}.png`));
    const [vector] = await embedImages([cutImage]);
    const score = await judge(vector, item, garment.filters);
    add(t.cutout, score);
    add(totals.cutout, score);
  }
}

const pct = (value: number, of: number) =>
  of ? `${Math.round((value / of) * 100)}%` : "–";
const row = (name: string, s: typeof totals) =>
  `${name.padEnd(10)} found ${pct(s.found, s.photos).padStart(4)} | cut-out: self ${pct(s.cutout.self, s.found).padStart(4)} type ${pct(s.cutout.type, s.found).padStart(4)} colour ${pct(s.cutout.colour, s.found).padStart(4)} | whole: self ${pct(s.whole.self, s.photos).padStart(4)} type ${pct(s.whole.type, s.photos).padStart(4)} colour ${pct(s.whole.colour, s.photos).padStart(4)}`;
for (const [type, s] of Object.entries(byType)) console.log(row(type, s));
console.log(row("All", totals));

await mkdir(join(DATA_DIR, "eval"), { recursive: true });
await writeFile(
  join(DATA_DIR, "eval", "outfit.json"),
  JSON.stringify({ perType, totals, byType }, null, 2),
);
