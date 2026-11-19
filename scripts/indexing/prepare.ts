/**
 * Step 1 of the indexing pipeline: datasets → data/catalog.jsonl + data/images/{id}.jpg.
 * Metadata comes from METADATA_DATASET and photos (up to 384×512) from
 * IMAGE_DATASET; products without a photo there are left out.
 * Idempotent: downloads and images that already exist are reused.
 * Usage: npm run index:prepare
 */
import { existsSync, statSync } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  asyncBufferFromFile,
  parquetMetadataAsync,
  parquetReadObjects,
} from "hyparquet";

import {
  type CatalogItem,
  isJpeg,
  METADATA_COLUMNS,
  normalizeRow,
  parseImageId,
  type RawRow,
} from "../../src/lib/indexing/catalog.ts";
import {
  IMAGE_DATASET,
  METADATA_DATASET,
} from "../../src/lib/indexing/dataset.ts";
import { CATALOG_FILE, IMAGES_DIR } from "../../src/lib/indexing/paths.ts";
import { downloadDataset } from "./download.ts";

const CHUNK_ROWS = 2_000;

type ImageCell = { bytes?: Uint8Array } | null;

/** Reads parquet files in chunks of rows, reporting progress. */
async function eachChunk(
  paths: string[],
  read: (
    options: Parameters<typeof parquetReadObjects>[0],
  ) => Promise<void> | void,
) {
  for (const path of paths) {
    const file = await asyncBufferFromFile(path);
    const metadata = await parquetMetadataAsync(file);
    const total = Number(metadata.num_rows);
    for (let rowStart = 0; rowStart < total; rowStart += CHUNK_ROWS) {
      const rowEnd = Math.min(rowStart + CHUNK_ROWS, total);
      await read({ file, metadata, rowStart, rowEnd });
      process.stdout.write(
        `\r→ ${path.split("/").pop()}: ${rowEnd}/${total} rows`,
      );
    }
    process.stdout.write("\n");
  }
}

const started = Date.now();
const metadataFiles = await downloadDataset(METADATA_DATASET);
const imageFiles = await downloadDataset(IMAGE_DATASET);
await mkdir(IMAGES_DIR, { recursive: true });

// 1. Photos: write every valid JPEG to data/images and remember its id.
const imageIds = new Set<number>();
let imageRows = 0;
let invalidImages = 0;
let imagesWritten = 0;
await eachChunk(imageFiles, async (options) => {
  const [ids, images] = await Promise.all([
    parquetReadObjects({ ...options, columns: ["id"] }),
    // Image bytes must not be decoded as UTF-8 text.
    parquetReadObjects({ ...options, columns: ["image"], utf8: false }),
  ]);
  const writes: Promise<unknown>[] = [];
  ids.forEach((row: RawRow, index) => {
    imageRows++;
    const id = parseImageId(row.id);
    const bytes = (images[index]?.image as ImageCell)?.bytes;
    if (id === null || !isJpeg(bytes)) return void invalidImages++;
    imageIds.add(id);
    const target = join(IMAGES_DIR, `${id}.jpg`);
    if (!existsSync(target) || statSync(target).size !== bytes.length) {
      writes.push(writeFile(target, bytes).then(() => imagesWritten++));
    }
  });
  await Promise.all(writes);
});

// 2. Metadata: keep products that have a photo.
const items: CatalogItem[] = [];
const skipped = new Map<string, number>();
let metadataRows = 0;
const skip = (reason: string) =>
  skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
await eachChunk(metadataFiles, async (options) => {
  const rows = await parquetReadObjects({
    ...options,
    columns: [...METADATA_COLUMNS],
  });
  for (const row of rows) {
    metadataRows++;
    const result = normalizeRow(row);
    if (!result.ok) skip(result.reason);
    else if (!imageIds.has(result.item.id)) skip("no photo");
    else items.push(result.item);
  }
});

const duplicates = items.length - new Set(items.map((item) => item.id)).size;
if (duplicates > 0)
  throw new Error(`Found ${duplicates} duplicated product ids`);

items.sort((a, b) => a.id - b.id);
const partial = `${CATALOG_FILE}.partial`;
await writeFile(
  partial,
  items.map((item) => JSON.stringify(item)).join("\n") + "\n",
);
await rename(partial, CATALOG_FILE);

// 3. Delete photos of products that are not in the catalog.
const keep = new Set(items.map((item) => `${item.id}.jpg`));
const stale = (await readdir(IMAGES_DIR)).filter((name) => !keep.has(name));
await Promise.all(stale.map((name) => rm(join(IMAGES_DIR, name))));

console.log(
  `✓ ${items.length} products → data/catalog.jsonl (${imagesWritten} new images, ${stale.length} removed)`,
);
console.log(
  skipped.size === 0
    ? "✓ No products skipped"
    : `! Skipped: ${JSON.stringify(Object.fromEntries(skipped))}`,
);
if (invalidImages > 0) console.log(`! ${invalidImages} invalid photos ignored`);
for (const [dataset, rows] of [
  [METADATA_DATASET, metadataRows],
  [IMAGE_DATASET, imageRows],
] as const) {
  if (rows !== dataset.expectedRows) {
    console.warn(
      `! Expected ${dataset.expectedRows} rows in ${dataset.repo}, read ${rows}`,
    );
  }
}
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
