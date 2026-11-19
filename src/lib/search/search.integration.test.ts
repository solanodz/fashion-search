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
import { searchProducts } from "./search";

const collection = `test_search_${randomUUID().slice(0, 8)}`;
const axis = (index: number) =>
  Array.from({ length: 512 }, (_, i) => (i === index ? 1 : 0));
const product = (id: number, gender: string, name = `Product ${id}`) =>
  ({
    id,
    name,
    gender,
    articleType: "Tshirts",
    baseColour: "Blue",
  }) as CatalogItem;

beforeAll(async () => {
  await createCollection(qdrant(), collection, 512);
  const items = [
    product(1, "Men"),
    product(2, "Women"),
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

  test("applies filters", async () => {
    const results = await searchProducts(qdrant(), collection, {
      vector: axis(0),
      filters: { gender: "Men" },
      limit: 2,
    });
    expect(results.map((r) => r.id)).toEqual([1]);
  });
});
