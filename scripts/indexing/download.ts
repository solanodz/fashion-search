import { createWriteStream, existsSync, statSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import {
  datasetFileUrl,
  type HfDataset,
} from "../../src/lib/indexing/dataset.ts";
import { RAW_DIR } from "../../src/lib/indexing/paths.ts";

/** Downloads a dataset's pinned parquet files into data/raw, skipping files already complete. */
export async function downloadDataset(dataset: HfDataset): Promise<string[]> {
  await mkdir(RAW_DIR, { recursive: true });
  const paths: string[] = [];

  for (const file of dataset.files) {
    const target = join(RAW_DIR, basename(file.path));
    paths.push(target);

    if (existsSync(target) && statSync(target).size === file.size) {
      console.log(`✓ ${basename(target)} already downloaded`);
      continue;
    }

    const mb = (file.size / 1e6).toFixed(1);
    console.log(`→ Downloading ${basename(target)} (${mb} MB)…`);
    const response = await fetch(datasetFileUrl(dataset, file.path));
    if (!response.ok || !response.body) {
      throw new Error(`Download failed (${response.status}) for ${file.path}`);
    }

    const partial = `${target}.partial`;
    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream),
      createWriteStream(partial),
    );
    const size = statSync(partial).size;
    if (size !== file.size) {
      throw new Error(
        `Size mismatch for ${file.path}: expected ${file.size}, got ${size}`,
      );
    }
    await rename(partial, target);
    console.log(`✓ ${basename(target)}`);
  }

  return paths;
}
