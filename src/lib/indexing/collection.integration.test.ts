import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, test } from "vitest";

import { qdrant } from "@/lib/qdrant";

import type { CatalogItem } from "./catalog";
import {
  aliasTarget,
  buildPoints,
  createCollection,
  pruneVersions,
  swapAlias,
  upsertPoints,
  type Point,
} from "./collection";

// Real Qdrant, fake 3-dim vectors: no model needed.
const alias = `test_${randomUUID().slice(0, 8)}`;

const point = (id: number, vector: number[], baseColour: string): Point => {
  const item: CatalogItem = {
    id,
    name: `Product ${id}`,
    gender: "Women",
    masterCategory: "Apparel",
    subCategory: "Dress",
    articleType: "Dresses",
    baseColour,
    season: null,
    year: null,
    usage: null,
  };
  return buildPoints([item], [{ id, vector: Float32Array.from(vector) }])[0];
};

afterAll(async () => {
  await pruneVersions(qdrant(), alias, []);
});

describe("versioned collections behind an alias", () => {
  test("creates, fills and swaps versions without downtime", async () => {
    const client = qdrant();

    await createCollection(client, `${alias}_v1`, 3);
    await upsertPoints(client, `${alias}_v1`, [point(1, [1, 0, 0], "Red")]);
    expect(await swapAlias(client, alias, `${alias}_v1`)).toBeNull();

    await createCollection(client, `${alias}_v2`, 3);
    await upsertPoints(
      client,
      `${alias}_v2`,
      [point(1, [1, 0, 0], "Red"), point(2, [0.9, 0.1, 0], "Blue")],
      {
        batchSize: 1,
      },
    );
    expect(await swapAlias(client, alias, `${alias}_v2`)).toBe(`${alias}_v1`);
    expect(await aliasTarget(client, alias)).toBe(`${alias}_v2`);

    // Queries through the alias see v2, with payload filters on indexed fields.
    const { points } = await client.query(alias, {
      query: [1, 0, 0],
      using: "image",
      filter: { must: [{ key: "baseColour", match: { value: "Blue" } }] },
      with_payload: true,
    });
    expect(points.map((p) => p.id)).toEqual([2]);

    const info = await client.getCollection(`${alias}_v2`);
    expect(Object.keys(info.payload_schema ?? {}).sort()).toEqual(
      [
        "articleType",
        "baseColour",
        "gender",
        "masterCategory",
        "subCategory",
      ].sort(),
    );

    // Keeping only the live version deletes the previous one.
    expect(await pruneVersions(client, alias, [`${alias}_v2`])).toEqual([
      `${alias}_v1`,
    ]);
  });
});
