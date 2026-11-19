import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { CatalogItem } from "@/lib/indexing/catalog";
import {
  buildPoints,
  createCollection,
  upsertPoints,
} from "@/lib/indexing/collection";
import { qdrant } from "@/lib/qdrant";

import { getFacets } from "./facets";

const collection = `test_facets_${randomUUID().slice(0, 8)}`;
const product = (
  id: number,
  gender: string,
  articleType: string,
  baseColour: string,
) =>
  ({
    id,
    name: `P${id}`,
    gender,
    masterCategory: "Apparel",
    articleType,
    baseColour,
  }) as CatalogItem;

beforeAll(async () => {
  await createCollection(qdrant(), collection, 2);
  const items = [
    product(1, "Women", "Dresses", "Red"),
    product(2, "Women", "Dresses", "Blue"),
    product(3, "Women", "Tops", "Red"),
    product(4, "Men", "Tshirts", "Red"),
  ];
  await upsertPoints(
    qdrant(),
    collection,
    buildPoints(
      items,
      items.map(({ id }) => ({ id, vector: new Float32Array([1, 0]) })),
    ),
  );
});

afterAll(async () => {
  await qdrant().deleteCollection(collection);
});

describe("getFacets", () => {
  test("counts every value without filters", async () => {
    const facets = await getFacets(qdrant(), collection, {});
    expect(facets.gender).toEqual([
      { value: "Women", count: 3 },
      { value: "Men", count: 1 },
    ]);
    expect(facets.baseColour).toEqual([
      { value: "Red", count: 3 },
      { value: "Blue", count: 1 },
    ]);
  });

  test("applies other filters but not the field's own", async () => {
    const facets = await getFacets(qdrant(), collection, {
      gender: "Women",
      baseColour: "Red",
    });
    // Gender ignores its own filter: men with red items are still an option.
    expect(facets.gender).toEqual([
      { value: "Women", count: 2 },
      { value: "Men", count: 1 },
    ]);
    // Colour ignores the colour filter but keeps gender.
    expect(facets.baseColour).toEqual([
      { value: "Red", count: 2 },
      { value: "Blue", count: 1 },
    ]);
    expect(facets.articleType.map((f) => f.value).sort()).toEqual([
      "Dresses",
      "Tops",
    ]);
  });
});
