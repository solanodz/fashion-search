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
  types: ["Dresses", "Watches"],
  categories: { Dresses: "Apparel", Watches: "Accessories" },
};

describe("normalizePoints", () => {
  it("fits points in [0, 1] keeping the aspect ratio, centred", () => {
    const xy = normalizePoints([
      [0, 0],
      [4, 2],
      [2, 1],
    ]);
    expect(Array.from(xy)).toEqual([0, 0.25, 1, 0.75, 0.5, 0.5]);
  });
});

describe("encodeMap / decodeMap", () => {
  it("round-trips ids, positions (to 16 bits) and types", () => {
    const xy = new Float32Array([0, 1, 0.5, 0.25, 1, 0]);
    const bytes = encodeMap([15970, 39386, 7], xy, [1, 0, 1]);
    expect(bytes.byteLength).toBe(4 + 3 * 10);
    const map = decodeMap(bytes.buffer as ArrayBuffer, meta);
    expect(Array.from(map.ids)).toEqual([15970, 39386, 7]);
    expect(Array.from(map.types)).toEqual([1, 0, 1]);
    map.xy.forEach((value, i) => expect(value).toBeCloseTo(xy[i], 4));
  });

  it("rejects a file that doesn't match its metadata", () => {
    const bytes = encodeMap([1, 2], new Float32Array(4), [0, 0]);
    expect(() => decodeMap(bytes.buffer as ArrayBuffer, meta)).toThrow(
      /expected .* 3 points/,
    );
  });
});

describe("placeQuery", () => {
  it("is pulled towards the most similar results", () => {
    const point = placeQuery([
      { x: 0, y: 0, score: 0.9 },
      { x: 1, y: 1, score: 0.5 },
    ])!;
    expect(point.x).toBeLessThan(0.01);
    expect(point.y).toBeLessThan(0.01);
  });

  it("averages equally similar results", () => {
    expect(
      placeQuery([
        { x: 0, y: 0, score: 0.3 },
        { x: 1, y: 0, score: 0.3 },
      ]),
    ).toEqual({ x: 0.5, y: 0 });
  });

  it("is null without results", () => {
    expect(placeQuery([])).toBeNull();
  });
});
