import { describe, expect, it } from "vitest";

import { gridCells, importance, occlude } from "./occlusion";

describe("gridCells", () => {
  it("tiles the image row by row without gaps", () => {
    const cells = gridCells(10, 9, 2, 3);
    expect(cells).toHaveLength(6);
    expect(cells[0]).toEqual({ x0: 0, x1: 5, y0: 0, y1: 3 });
    expect(cells[5]).toEqual({ x0: 5, x1: 10, y0: 6, y1: 9 });
  });
});

describe("occlude", () => {
  it("greys out one cell and leaves the rest and the alpha alone", () => {
    // 2×1 RGBA image: red, then blue.
    const data = [255, 0, 0, 255, 0, 0, 255, 255];
    const out = occlude(data, 2, 4, { x0: 1, x1: 2, y0: 0, y1: 1 });
    expect(Array.from(out)).toEqual([255, 0, 0, 255, 128, 128, 128, 255]);
    expect(data[4]).toBe(0); // the input is not modified
  });
});

describe("importance", () => {
  it("scales drops to the largest and ignores cells that didn't matter", () => {
    expect(Array.from(importance(0.3, [0.2, 0.25, 0.31]))).toEqual([
      1,
      expect.closeTo(0.5, 5),
      0,
    ]);
  });

  it("is all zero when hiding nothing lowers the similarity", () => {
    expect(Array.from(importance(0.3, [0.3, 0.4]))).toEqual([0, 0]);
  });
});
