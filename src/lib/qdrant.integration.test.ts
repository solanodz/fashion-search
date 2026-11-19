import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { qdrant } from "./qdrant";

// Runs against a real Qdrant: `npm run db:up` locally, a service container in CI.
// Uses a throwaway collection with tiny vectors, so no model is needed.
const collection = `test_${randomUUID()}`;

describe("qdrant client", () => {
  beforeAll(async () => {
    await qdrant().createCollection(collection, {
      vectors: { size: 3, distance: "Cosine" },
    });
    await qdrant().createPayloadIndex(collection, {
      field_name: "color",
      field_schema: "keyword",
      wait: true,
    });
    await qdrant().upsert(collection, {
      wait: true,
      points: [
        { id: 1, vector: [1, 0, 0], payload: { color: "Blue" } },
        { id: 2, vector: [0.9, 0.1, 0], payload: { color: "Red" } },
        { id: 3, vector: [0, 1, 0], payload: { color: "Blue" } },
      ],
    });
  });

  afterAll(async () => {
    await qdrant().deleteCollection(collection);
  });

  test("returns the nearest points first", async () => {
    const { points } = await qdrant().query(collection, {
      query: [1, 0, 0],
      limit: 2,
    });
    expect(points.map((p) => p.id)).toEqual([1, 2]);
  });

  test("applies payload filters", async () => {
    const { points } = await qdrant().query(collection, {
      query: [1, 0, 0],
      filter: { must: [{ key: "color", match: { value: "Blue" } }] },
      limit: 2,
      with_payload: true,
    });
    expect(points.map((p) => p.id)).toEqual([1, 3]);
  });
});
