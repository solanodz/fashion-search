import { describe, expect, it } from "vitest";

import {
  decodeMap,
  encodeMap,
  normalizePoints,
  placeQuery,
} from "./embedding-map";

const meta = {
  model: "m",
  dtype: "q8",
  count: 3,
  dimensions: 3,
  types: ["Dresses", "Watches"],
  categories: { Dresses: "Apparel", Watches: "Accessories" },
};

describe("normalizePoints", () => {
  it("fits points in the unit cube keeping proportions, centred", () => {
    const xyz = normalizePoints([
      [0, 0, 0],
      [4, 2, 1],
      [2, 1, 0.5],
    ]);
    expect(Array.from(xyz)).toEqual([
      0, 0.25, 0.375, 1, 0.75, 0.625, 0.5, 0.5, 0.5,
    ]);
  });
});

describe("encodeMap / decodeMap", () => {
  it("round-trips ids, positions (to 16 bits) and types", () => {
    const xyz = new Float32Array([0, 1, 0.5, 0.5, 0.25, 0.75, 1, 0, 0.1]);
    const bytes = encodeMap([15970, 39386, 7], xyz, [1, 0, 1]);
    expect(bytes.byteLength).toBe(4 + 3 * 12);
    const map = decodeMap(bytes.buffer as ArrayBuffer, meta);
    expect(Array.from(map.ids)).toEqual([15970, 39386, 7]);
    expect(Array.from(map.types)).toEqual([1, 0, 1]);
    map.xyz.forEach((value, i) => expect(value).toBeCloseTo(xyz[i], 4));
  });

  it("rejects a file that doesn't match its metadata", () => {
    const bytes = encodeMap([1, 2], new Float32Array(6), [0, 0]);
    expect(() => decodeMap(bytes.buffer as ArrayBuffer, meta)).toThrow(
      /expected .* 3 points in 3D/,
    );
  });
});

describe("placeQuery", () => {
  it("is pulled towards the most similar results", () => {
    const point = placeQuery([
      { x: 0, y: 0, z: 0, score: 0.9 },
      { x: 1, y: 1, z: 1, score: 0.5 },
    ])!;
    expect(point.x).toBeLessThan(0.01);
    expect(point.z).toBeLessThan(0.01);
  });

  it("averages equally similar results", () => {
    expect(
      placeQuery([
        { x: 0, y: 0, z: 0, score: 0.3 },
        { x: 1, y: 0, z: 1, score: 0.3 },
      ]),
    ).toEqual({ x: 0.5, y: 0, z: 0.5 });
  });

  it("is null without results", () => {
    expect(placeQuery([])).toBeNull();
  });
});
