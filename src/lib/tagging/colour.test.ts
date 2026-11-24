import { describe, expect, it } from "vitest";

import { colourHistogram, HISTOGRAM_BINS, histogramSimilarity } from "./colour";

/** A width × height RGB image filled by a function of the pixel position. */
function image(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
): Uint8Array {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 3);
  }
  return data;
}

const solid = (rgb: [number, number, number]) =>
  colourHistogram(
    image(6, 8, () => rgb),
    6,
    8,
    3,
  );

describe("colourHistogram", () => {
  it("puts a solid colour in one bin and sums to 1", () => {
    const red = solid([200, 20, 20]);
    expect(red).toHaveLength(HISTOGRAM_BINS);
    expect(Math.max(...red)).toBeCloseTo(1);
    expect(red.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it("separates hues, and greys from colours", () => {
    const red = solid([200, 20, 20]);
    const blue = solid([20, 20, 200]);
    const grey = solid([120, 120, 120]);
    const black = solid([10, 10, 10]);
    expect(histogramSimilarity(red, blue)).toBe(0);
    expect(histogramSimilarity(red, grey)).toBe(0);
    expect(histogramSimilarity(grey, black)).toBe(0);
    expect(histogramSimilarity(red, solid([210, 30, 25]))).toBeCloseTo(1);
  });

  it("ignores the white background", () => {
    // A red product on white: only the red pixels count.
    const onWhite = colourHistogram(
      image(6, 8, (x) => (x < 2 ? [200, 20, 20] : [255, 255, 255])),
      6,
      8,
      3,
    );
    expect(histogramSimilarity(onWhite, solid([200, 20, 20]))).toBeCloseTo(1);
    // A blank photo has no colours at all.
    expect(Math.max(...solid([255, 255, 255]))).toBe(0);
  });

  it("counts the centre more than the edges", () => {
    // Blue in the middle columns, red at the sides: equal areas.
    const histogram = colourHistogram(
      image(8, 8, (x) => (x >= 2 && x < 6 ? [20, 20, 200] : [200, 20, 20])),
      8,
      8,
      3,
    );
    expect(
      histogramSimilarity(histogram, solid([20, 20, 200])),
    ).toBeGreaterThan(histogramSimilarity(histogram, solid([200, 20, 20])));
  });

  it("reads RGBA pixels too", () => {
    const rgba = new Uint8ClampedArray(6 * 8 * 4);
    for (let i = 0; i < 6 * 8; i++) rgba.set([20, 20, 200, 255], i * 4);
    expect(
      histogramSimilarity(colourHistogram(rgba, 6, 8, 4), solid([20, 20, 200])),
    ).toBeCloseTo(1);
  });
});
