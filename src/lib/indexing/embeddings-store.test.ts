// @vitest-environment node
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { EmbeddingsStore } from "./embeddings-store";

const manifest = { model: "test-model", dtype: "q8", dimensions: 3 };
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "embeddings-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("EmbeddingsStore", () => {
  test("appends batches and reads them back in order", async () => {
    const store = await EmbeddingsStore.open(dir, manifest);
    await store.append(
      [10, 20],
      [new Float32Array([1, 0, 0]), new Float32Array([0, 1, 0])],
    );
    await store.append([30], [new Float32Array([0, 0, 1])]);

    const reopened = await EmbeddingsStore.open(dir, manifest);
    expect(reopened.count).toBe(3);
    expect(Array.from(await reopened.ids())).toEqual([10, 20, 30]);
    expect(
      (await reopened.readAll()).map(({ id, vector }) => [
        id,
        Array.from(vector),
      ]),
    ).toEqual([
      [10, [1, 0, 0]],
      [20, [0, 1, 0]],
      [30, [0, 0, 1]],
    ]);
  });

  test("drops a partially written batch when reopened", async () => {
    const store = await EmbeddingsStore.open(dir, manifest);
    await store.append([10], [new Float32Array([1, 0, 0])]);
    // Simulate a crash after writing the vector but before writing its id.
    await appendFile(
      join(dir, "vectors.f32"),
      new Uint8Array(new Float32Array([0, 1, 0]).buffer),
    );

    const reopened = await EmbeddingsStore.open(dir, manifest);
    expect(reopened.count).toBe(1);
    expect(await reopened.readAll()).toHaveLength(1);
  });

  test("refuses to mix vectors from a different model", async () => {
    await EmbeddingsStore.open(dir, manifest);
    await expect(
      EmbeddingsStore.open(dir, { ...manifest, dtype: "fp32" }),
    ).rejects.toThrow(/--fresh/);
  });

  test("rejects vectors with the wrong dimensions", async () => {
    const store = await EmbeddingsStore.open(dir, manifest);
    await expect(store.append([1], [new Float32Array([1, 0])])).rejects.toThrow(
      /3 dims/,
    );
  });
});
