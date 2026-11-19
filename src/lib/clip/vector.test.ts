import { describe, expect, test } from "vitest";

import { combine, dot, l2Normalize, splitRows } from "./vector";

describe("l2Normalize", () => {
  test("returns a unit vector with the same direction", () => {
    const result = l2Normalize(new Float32Array([3, 4]));
    expect(Array.from(result)).toEqual([0.6000000238418579, 0.800000011920929]);
    expect(dot(result, result)).toBeCloseTo(1, 6);
  });

  test("rejects zero vectors", () => {
    expect(() => l2Normalize(new Float32Array([0, 0]))).toThrow(/zero/);
  });
});

describe("splitRows", () => {
  test("splits a batched output into normalized rows", () => {
    const rows = splitRows(new Float32Array([2, 0, 0, 5]), 2, 2);
    expect(rows.map((row) => Array.from(row))).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  test("fails when the buffer does not match the shape", () => {
    expect(() => splitRows(new Float32Array(3), 2, 2)).toThrow(/2×2/);
  });
});

describe("combine", () => {
  test("returns the normalized weighted sum", () => {
    const result = combine([
      { vector: new Float32Array([1, 0]), weight: 1 },
      { vector: new Float32Array([0, 1]), weight: 2 },
    ]);
    expect(result[0]).toBeCloseTo(1 / Math.sqrt(5), 6);
    expect(result[1]).toBeCloseTo(2 / Math.sqrt(5), 6);
  });

  test("a single part is just normalized", () => {
    expect(
      Array.from(combine([{ vector: new Float32Array([0, 3]), weight: 1 }])),
    ).toEqual([0, 1]);
  });
});
