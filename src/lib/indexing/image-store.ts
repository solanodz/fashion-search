/**
 * Helpers for uploading catalog images to Cloudflare R2 through its
 * S3-compatible API (ADR 0005). Objects are keyed by product id with no
 * extension, so the UI can request `<NEXT_PUBLIC_IMAGE_BASE_URL>/<id>`.
 */

export const IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const R2_ENV = {
  accountId: "R2_ACCOUNT_ID",
  bucket: "R2_BUCKET",
  accessKeyId: "R2_ACCESS_KEY_ID",
  secretAccessKey: "R2_SECRET_ACCESS_KEY",
} as const;

/** Reads the R2 settings from the environment, naming every missing one. */
export function r2ConfigFromEnv(
  env: Record<string, string | undefined>,
): R2Config {
  const missing = Object.values(R2_ENV).filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join(", ")}. See .env.example.`);
  }
  return {
    accountId: env[R2_ENV.accountId]!,
    bucket: env[R2_ENV.bucket]!,
    accessKeyId: env[R2_ENV.accessKeyId]!,
    secretAccessKey: env[R2_ENV.secretAccessKey]!,
  };
}

/** The bucket's S3 API URL, e.g. https://<account>.r2.cloudflarestorage.com/<bucket>. */
export function bucketUrl({ accountId, bucket }: R2Config): string {
  return `https://${accountId}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}`;
}

/** The object key for a product's image. */
export function imageKey(id: number): string {
  return String(id);
}

/** Parses one page of an S3 ListObjectsV2 response. */
export function parseListPage(xml: string): {
  keys: string[];
  nextToken: string | undefined;
} {
  const keys = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map((m) =>
    decodeXml(m[1]),
  );
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const token = xml.match(
    /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/,
  )?.[1];
  return { keys, nextToken: truncated && token ? decodeXml(token) : undefined };
}

function decodeXml(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

/** Ids whose image is not in the bucket yet. */
export function pendingIds(ids: number[], existingKeys: Set<string>): number[] {
  return ids.filter((id) => !existingKeys.has(imageKey(id)));
}

/** Whether a failed request is worth retrying (throttling or a server error). */
export function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Runs `task` over `items` with at most `concurrency` in flight. Stops
 * starting new tasks after the first failure and rethrows it.
 */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let failure: unknown;
  async function worker() {
    while (failure === undefined && next < items.length) {
      const item = items[next++];
      try {
        await task(item);
      } catch (error) {
        failure ??= error;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  if (failure !== undefined) throw failure;
}
