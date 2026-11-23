import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { CatalogItem } from "@/lib/indexing/catalog";
import {
  buildPoints,
  createCollection,
  upsertPoints,
} from "@/lib/indexing/collection";
import { qdrant } from "@/lib/qdrant";

import { queryKeywords } from "./keywords";
import { runSearchWithLists, searchProducts } from "./search";

const collection = `test_search_${randomUUID().slice(0, 8)}`;
const axis = (index: number) =>
  Array.from({ length: 512 }, (_, i) => (i === index ? 1 : 0));
const product = (
  id: number,
  gender: string,
  name = `Product ${id}`,
  baseColour = "Blue",
) =>
  ({
    id,
    name,
    gender,
    articleType: "Tshirts",
    baseColour,
  }) as CatalogItem;

beforeAll(async () => {
  await createCollection(qdrant(), collection, 512);
  const items = [
    product(1, "Men"),
    product(2, "Women", "Product 2", "Black"),
    product(3, "Women", "Striped Polka Scarf"),
  ];
  await upsertPoints(
    qdrant(),
    collection,
    buildPoints(items, [
      { id: 1, vector: Float32Array.from(axis(0)) },
      { id: 2, vector: Float32Array.from(axis(1)) },
      { id: 3, vector: Float32Array.from(axis(2)) },
    ]),
  );
});

afterAll(async () => {
  await qdrant().deleteCollection(collection);
});

describe("searchProducts", () => {
  test("returns products ordered by similarity with their payload", async () => {
    const results = await searchProducts(qdrant(), collection, {
      vector: axis(0),
      filters: {},
      limit: 2,
    });
    expect(results).toHaveLength(2);
    expect([results[0].id, results[0].product.name]).toEqual([1, "Product 1"]);
    expect(results[0].score).toBeCloseTo(1);
    expect(results[0].signals).toBeUndefined();
  });

  test("scores each part of a combined query", async () => {
    const results = await searchProducts(qdrant(), collection, {
      vector: axis(0),
      filters: {},
      limit: 3,
      parts: [
        { name: "photo", vector: axis(0) },
        { name: "text", vector: axis(1) },
      ],
    });
    expect(results[0].parts?.photo).toBeCloseTo(1);
    expect(results[0].parts?.text).toBeCloseTo(0);
    expect(results.find((r) => r.id === 2)?.parts?.text).toBeCloseTo(1);
  });

  test("hybrid search adds keyword matches and reports the signals", async () => {
    const results = await searchProducts(qdrant(), collection, {
      vector: axis(0),
      filters: {},
      limit: 3,
      keywords: queryKeywords("polka scarf")!,
    });
    const scarf = results.find((r) => r.id === 3)!;
    // The scarf is last by image but the only keyword match, so fusion lifts it.
    expect(results[0].id).toBe(3);
    expect(scarf.signals).toEqual(["image", "keywords"]);
    // Its score is still the cosine similarity to the image query.
    expect(scarf.score).toBeCloseTo(0);
    expect(results.find((r) => r.id === 1)?.signals).toEqual(["image"]);
  });

  test("compare mode returns the image and keyword lists before fusion", async () => {
    const { results, lists } = await runSearchWithLists(qdrant(), collection, {
      vector: axis(0),
      filters: {},
      limit: 3,
      keywords: queryKeywords("polka scarf")!,
      compare: true,
    });
    expect(results[0].id).toBe(3);
    expect(lists?.image[0].id).toBe(1);
    expect(lists?.keywords.map((r) => r.id)).toEqual([3]);
    expect(lists?.keywords[0].keywordScore).toBeGreaterThan(0);
    // Products 2 and 3 tie on the image search, so the scarf is 2nd or 3rd.
    expect(results[0].ranks?.keywords).toBe(1);
    expect([2, 3]).toContain(results[0].ranks?.image);
    // Without compare, or without keywords, there are no lists.
    const plain = await runSearchWithLists(qdrant(), collection, {
      vector: axis(0),
      filters: {},
      limit: 3,
      compare: true,
    });
    expect(plain.lists).toBeUndefined();
  });

  test("applies filters", async () => {
    const results = await searchProducts(qdrant(), collection, {
      vector: axis(0),
      filters: { gender: "Men" },
      limit: 2,
    });
    expect(results.map((r) => r.id)).toEqual([1]);
  });

  test("leaves out excluded colours, in both lists of a hybrid search", async () => {
    const results = await searchProducts(qdrant(), collection, {
      vector: axis(1),
      filters: {},
      exclude: { baseColour: ["Black"] },
      limit: 3,
      keywords: queryKeywords("product")!,
    });
    // Product 2 is the closest by image and matches the keyword, but is black.
    expect(results.map((r) => r.id).sort()).toEqual([1, 3]);
  });
});
