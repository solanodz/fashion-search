import { describe, expect, it } from "vitest";

import {
  bucketUrl,
  isRetryable,
  parseListPage,
  pendingIds,
  r2ConfigFromEnv,
  runPool,
} from "./image-store";

const env = {
  R2_ACCOUNT_ID: "abc123",
  R2_BUCKET: "fashion-images",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
};

describe("r2ConfigFromEnv", () => {
  it("reads the four settings", () => {
    expect(r2ConfigFromEnv(env)).toEqual({
      accountId: "abc123",
      bucket: "fashion-images",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
  });

  it("names every missing setting", () => {
    expect(() => r2ConfigFromEnv({ R2_BUCKET: "b" })).toThrow(
      "Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
    );
  });
});

it("builds the bucket's S3 API URL", () => {
  expect(bucketUrl(r2ConfigFromEnv(env))).toBe(
    "https://abc123.r2.cloudflarestorage.com/fashion-images",
  );
});

describe("parseListPage", () => {
  it("returns keys and the continuation token of a truncated page", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult><IsTruncated>true</IsTruncated>
<Contents><Key>15970</Key><Size>12000</Size></Contents>
<Contents><Key>39386</Key><Size>9000</Size></Contents>
<NextContinuationToken>a&amp;b</NextContinuationToken></ListBucketResult>`;
    expect(parseListPage(xml)).toEqual({
      keys: ["15970", "39386"],
      nextToken: "a&b",
    });
  });

  it("has no token on the last page", () => {
    const xml =
      "<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>1</Key></Contents></ListBucketResult>";
    expect(parseListPage(xml)).toEqual({ keys: ["1"], nextToken: undefined });
  });
});

it("keeps only ids missing from the bucket", () => {
  expect(pendingIds([1, 2, 3], new Set(["2"]))).toEqual([1, 3]);
});

it("retries throttling and server errors only", () => {
  expect([429, 500, 503].map(isRetryable)).toEqual([true, true, true]);
  expect([400, 403, 404].map(isRetryable)).toEqual([false, false, false]);
});

describe("runPool", () => {
  it("runs every item with bounded concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const done: number[] = [];
    await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      done.push(n);
      inFlight--;
    });
    expect(done.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
  });

  it("stops starting work after a failure and rethrows it", async () => {
    const started: number[] = [];
    await expect(
      runPool([1, 2, 3, 4], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([1, 2]);
  });
});
