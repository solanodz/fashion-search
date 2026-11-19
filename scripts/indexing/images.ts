/**
 * Uploads catalog images (data/images/<id>.jpg) to a Cloudflare R2 bucket
 * (ADR 0005). Objects already in the bucket are skipped, so the script can be
 * stopped with Ctrl+C and rerun.
 *
 * Usage:
 *   npm run index:images              # R2_* settings from .env.local
 *   npm run index:images -- --dry-run # count what would be uploaded
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { AwsClient } from "aws4fetch";

import type { CatalogItem } from "../../src/lib/indexing/catalog.ts";
import {
  bucketUrl,
  IMAGE_CACHE_CONTROL,
  imageKey,
  isRetryable,
  parseListPage,
  pendingIds,
  r2ConfigFromEnv,
  runPool,
} from "../../src/lib/indexing/image-store.ts";
import { CATALOG_FILE, IMAGES_DIR } from "../../src/lib/indexing/paths.ts";

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    concurrency: { type: "string", default: "32" },
  },
});

const config = r2ConfigFromEnv(process.env);
const base = bucketUrl(config);
const r2 = new AwsClient({
  accessKeyId: config.accessKeyId,
  secretAccessKey: config.secretAccessKey,
  service: "s3",
  region: "auto",
  retries: 0,
});

async function request(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let response: Response | undefined;
    try {
      response = await r2.fetch(url, init);
    } catch (error) {
      if (attempt >= 5) throw error;
    }
    if (response?.ok) return response;
    if (response && (!isRetryable(response.status) || attempt >= 5)) {
      throw new Error(
        `${init?.method ?? "GET"} ${url} → ${response.status}: ${await response.text()}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 250));
  }
}

async function existingKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  let token: string | undefined;
  do {
    const params = new URLSearchParams({
      "list-type": "2",
      "max-keys": "1000",
    });
    if (token) params.set("continuation-token", token);
    const page = parseListPage(
      await (await request(`${base}?${params}`)).text(),
    );
    for (const key of page.keys) keys.add(key);
    token = page.nextToken;
  } while (token);
  return keys;
}

const ids = (await readFile(CATALOG_FILE, "utf8"))
  .trim()
  .split("\n")
  .map((line) => (JSON.parse(line) as CatalogItem).id);

console.log(`→ ${config.bucket}: listing existing objects`);
const todo = pendingIds(ids, await existingKeys());
console.log(
  `→ ${ids.length - todo.length} of ${ids.length} already uploaded, ${todo.length} to go`,
);
if (args["dry-run"] || todo.length === 0) process.exit(0);

let stopping = false;
process.once("SIGINT", () => {
  stopping = true;
  console.log("\n→ Stopping after in-flight uploads. Rerun to resume.");
});

const started = Date.now();
let done = 0;
await runPool(todo, Number(args.concurrency), async (id) => {
  if (stopping) return;
  const body = await readFile(join(IMAGES_DIR, `${id}.jpg`));
  await request(`${base}/${imageKey(id)}`, {
    method: "PUT",
    body,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": IMAGE_CACHE_CONTROL,
    },
  });
  done++;
  if (done % 100 === 0 || done === todo.length) {
    process.stdout.write(`\r→ Uploaded ${done}/${todo.length}`);
  }
});
process.stdout.write("\n");

const seconds = (Date.now() - started) / 1000;
console.log(
  `✓ Uploaded ${done} images in ${seconds.toFixed(0)}s${stopping ? " (stopped early)" : ""}`,
);
