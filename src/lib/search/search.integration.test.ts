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

describe("search with feedback", () => {
  const feedbackCollection = `test_feedback_${randomUUID().slice(0, 8)}`;
  /** A unit vector near axis 0, leaning towards another axis. */
  const near = (towards: number, amount: number) => {
    const vector: number[] = axis(0);
    vector[towards] = amount;
    const norm = Math.hypot(1, amount);
    return Float32Array.from(vector, (value) => value / norm);
  };
  const item = (
    id: number,
    articleType: string,
    baseColour: string,
    gender: string,
  ) =>
    ({
      id,
      name: `Product ${id}`,
      gender,
      articleType,
      baseColour,
    }) as CatalogItem;

  beforeAll(async () => {
    await createCollection(qdrant(), feedbackCollection, 512);
    // By similarity to axis 0: 10, 11, 13, 14, 12, 15.
    await upsertPoints(
      qdrant(),
      feedbackCollection,
      buildPoints(
        [
          item(10, "Dresses", "Red", "Women"),
          item(11, "Dresses", "Black", "Women"),
          item(12, "Dresses", "Red", "Women"),
          item(13, "Tops", "Red", "Men"),
          item(14, "Dresses", "Black", "Women"),
          item(15, "Dresses", "Red", "Women"),
        ],
        [
          { id: 10, vector: near(1, 0.1) },
          { id: 11, vector: near(1, 0.2) },
          { id: 12, vector: near(2, 0.6) },
          { id: 13, vector: near(1, 0.3) },
          { id: 14, vector: near(1, 0.4) },
          { id: 15, vector: near(2, 0.9) },
        ],
      ),
    );
  });

  afterAll(async () => {
    await qdrant().deleteCollection(feedbackCollection);
  });

  const search = (
    feedback: { like: number[]; dislike: number[] },
    feedbackMode?: "vectors" | "fields" | "both",
  ) =>
    runSearchWithLists(qdrant(), feedbackCollection, {
      vector: axis(0),
      filters: {},
      limit: 6,
      feedback,
      feedbackMode,
    });

  test("without feedback, results are ordered by similarity", async () => {
    const { results, leaning } = await search({ like: [], dislike: [] });
    expect(results.map((r) => r.id)).toEqual([10, 11, 13, 14, 12, 15]);
    expect(leaning).toBeUndefined();
  });

  test("a like and a dislike reorder the rest by what the liked one has", async () => {
    const { results, leaning } = await search({ like: [10], dislike: [11] });
    // The marked ones leave; red women's dresses come first, then the rest.
    expect(results.map((r) => r.id)).toEqual([12, 15, 13, 14]);
    expect(leaning).toEqual({
      prefer: { articleType: "Dresses", baseColour: "Red", gender: "Women" },
      avoid: { baseColour: ["Black"] },
    });
    // Scores are still similarities to the query as typed.
    expect(results[0].score).toBeCloseTo(1 / Math.hypot(1, 0.6));
  });

  test("the vectors alone move the query away from a dislike", async () => {
    const { results, leaning } = await search(
      { like: [], dislike: [11] },
      "vectors",
    );
    // 11 leans towards axis 1, like 10, 13 and 14: the axis 2 ones gain.
    expect(results.map((r) => r.id)).not.toContain(11);
    expect(results.map((r) => r.id).indexOf(12)).toBeLessThan(
      results.map((r) => r.id).indexOf(14),
    );
    expect(leaning).toBeUndefined();
  });

  test("a dislike alone says nothing about fields", async () => {
    const { results, leaning } = await search({ like: [], dislike: [11] });
    expect(results).toHaveLength(5);
    expect(leaning).toEqual({ prefer: {}, avoid: {} });
  });
});
