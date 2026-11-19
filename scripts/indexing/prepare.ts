/**
 * Step 1 of the indexing pipeline: dataset → data/catalog.jsonl + data/images/{id}.jpg.
 * Idempotent: downloads and images that already exist are reused.
 * Usage: npm run index:prepare
 */
import { existsSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
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
} from "../../src/lib/indexing/catalog.ts";
import { DATASET } from "../../src/lib/indexing/dataset.ts";
import { CATALOG_FILE, IMAGES_DIR } from "../../src/lib/indexing/paths.ts";
import { downloadDataset } from "./download.ts";

const CHUNK_ROWS = 2_000;

type ImageCell = { bytes?: Uint8Array } | null;

const started = Date.now();
const files = await downloadDataset();
await mkdir(IMAGES_DIR, { recursive: true });

const items: CatalogItem[] = [];
const skipped = new Map<string, number>();
let imagesWritten = 0;
const pendingWrites: Promise<unknown>[] = [];
const skip = (reason: string) =>
  skipped.set(reason, (skipped.get(reason) ?? 0) + 1);

for (const path of files) {
  const file = await asyncBufferFromFile(path);
  const metadata = await parquetMetadataAsync(file);
  const total = Number(metadata.num_rows);

  for (let rowStart = 0; rowStart < total; rowStart += CHUNK_ROWS) {
    const rowEnd = Math.min(rowStart + CHUNK_ROWS, total);
    const rows = await parquetReadObjects({
      file,
      metadata,
      columns: [...METADATA_COLUMNS],
      rowStart,
      rowEnd,
    });
    // Image bytes must not be decoded as UTF-8 text.
    const images = await parquetReadObjects({
      file,
      metadata,
      columns: ["image"],
      rowStart,
      rowEnd,
      utf8: false,
    });

    rows.forEach((row, index) => {
      const result = normalizeRow(row);
      if (!result.ok) return skip(result.reason);
      const bytes = (images[index]?.image as ImageCell)?.bytes;
      if (!isJpeg(bytes)) return skip("missing or invalid image");
      items.push(result.item);

      const target = join(IMAGES_DIR, `${result.item.id}.jpg`);
      if (!existsSync(target) || statSync(target).size !== bytes.length) {
        pendingWrites.push(
          writeFile(target, bytes).then(() => imagesWritten++),
        );
      }
    });
    await Promise.all(pendingWrites.splice(0));
    process.stdout.write(
      `\r→ ${path.split("/").pop()}: ${rowEnd}/${total} rows`,
    );
  }
  process.stdout.write("\n");
}

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

const skippedTotal = [...skipped.values()].reduce(
  (sum, count) => sum + count,
  0,
);
console.log(
  `✓ ${items.length} products → data/catalog.jsonl (${imagesWritten} new images)`,
);
console.log(
  skippedTotal === 0
    ? "✓ No rows skipped"
    : `! Skipped ${skippedTotal} rows: ${JSON.stringify(Object.fromEntries(skipped))}`,
);
if (items.length + skippedTotal !== DATASET.expectedRows) {
  console.warn(
    `! Expected ${DATASET.expectedRows} rows in the dataset, read ${items.length + skippedTotal}`,
  );
}
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
