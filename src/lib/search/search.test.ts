import { describe, expect, test } from "vitest";

import { cosine, denseVector, toQdrantFilter } from "./search";

describe("toQdrantFilter", () => {
  test("matches every given field and skips empty ones", () => {
    expect(
      toQdrantFilter({
        gender: "Women",
        baseColour: "Red",
        articleType: undefined,
      }),
    ).toEqual({
      must: [
        { key: "gender", match: { value: "Women" } },
        { key: "baseColour", match: { value: "Red" } },
      ],
    });
  });

  test("returns no filter when nothing is selected", () => {
    expect(toQdrantFilter({})).toBeUndefined();
    expect(toQdrantFilter({}, {})).toBeUndefined();
  });

  test("leaves out excluded values", () => {
    expect(
      toQdrantFilter({ gender: "Men" }, { baseColour: ["Black", "Grey"] }),
    ).toEqual({
      must: [{ key: "gender", match: { value: "Men" } }],
      must_not: [{ key: "baseColour", match: { any: ["Black", "Grey"] } }],
    });
    expect(toQdrantFilter({}, { baseColour: ["Black"] })).toEqual({
      must_not: [{ key: "baseColour", match: { any: ["Black"] } }],
    });
  });

  test("leaves out products by id", () => {
    expect(toQdrantFilter({}, {}, [7, 9])).toEqual({
      must_not: [{ has_id: [7, 9] }],
    });
    expect(toQdrantFilter({}, { baseColour: ["Black"] }, [7])).toEqual({
      must_not: [
        { key: "baseColour", match: { any: ["Black"] } },
        { has_id: [7] },
      ],
    });
  });
});

describe("cosine", () => {
  test("is 1 for the same direction, 0 for orthogonal, -1 for opposite", () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 3])).toBeCloseTo(0);
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1);
  });

  test("is 0 for a zero vector", () => {
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });
});

describe("denseVector", () => {
  test("reads unnamed and named dense vectors", () => {
    expect(denseVector([0.1, 0.2])).toEqual([0.1, 0.2]);
    expect(
      denseVector({ keywords: { indices: [1], values: [1] }, image: [0.3] }),
    ).toEqual([0.3]);
  });

  test("returns null when there is no dense vector", () => {
    expect(denseVector(undefined)).toBeNull();
    expect(denseVector({ keywords: { indices: [], values: [] } })).toBeNull();
  });
});
