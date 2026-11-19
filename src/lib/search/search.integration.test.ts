import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { CatalogItem } from "@/lib/indexing/catalog";
import { createCollection, upsertPoints } from "@/lib/indexing/collection";
import { qdrant } from "@/lib/qdrant";

import { searchProducts } from "./search";

const collection = `test_search_${randomUUID().slice(0, 8)}`;
const axis = (index: number) =>
  Array.from({ length: 512 }, (_, i) => (i === index ? 1 : 0));
const product = (id: number, gender: string) =>
  ({
    id,
    name: `Product ${id}`,
    gender,
    articleType: "Tshirts",
    baseColour: "Blue",
  }) as CatalogItem;

beforeAll(async () => {
  await createCollection(qdrant(), collection, 512);
  await upsertPoints(qdrant(), collection, [
    { id: 1, vector: axis(0), payload: product(1, "Men") },
    { id: 2, vector: axis(1), payload: product(2, "Women") },
  ]);
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
    expect(results.map((r) => [r.id, r.product.name])).toEqual([
      [1, "Product 1"],
      [2, "Product 2"],
    ]);
  });

  test("applies filters", async () => {
    const results = await searchProducts(qdrant(), collection, {
      vector: axis(0),
      filters: { gender: "Women" },
      limit: 2,
    });
    expect(results.map((r) => r.id)).toEqual([2]);
  });
});
