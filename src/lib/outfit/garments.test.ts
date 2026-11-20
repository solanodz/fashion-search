import { describe, expect, it } from "vitest";

import { cutOut, cutoutFrame, garmentRegions } from "./garments";

/** A width × height mask with 255 inside the given rectangle. */
function rect(
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) mask[y * width + x] = 255;
  return mask;
}

describe("garmentRegions", () => {
  it("finds garments with their bounds and share, in display order", () => {
    const regions = garmentRegions(
      [
        { label: "Pants", mask: rect(10, 10, 2, 5, 8, 10) },
        { label: "Upper-clothes", mask: rect(10, 10, 1, 1, 9, 5) },
        { label: "Face", mask: rect(10, 10, 4, 0, 6, 1) },
      ],
      10,
      10,
    );
    expect(regions.map((r) => r.garment.key)).toEqual(["top", "bottom"]);
    expect(regions[0].box).toEqual({ x0: 1, y0: 1, x1: 9, y1: 5 });
    expect(regions[1].share).toBeCloseTo(0.3);
  });

  it("keeps only the bigger shoe", () => {
    const [shoes] = garmentRegions(
      [
        { label: "Left-shoe", mask: rect(10, 10, 1, 8, 3, 10) },
        { label: "Right-shoe", mask: rect(10, 10, 6, 8, 9, 10) },
      ],
      10,
      10,
    );
    expect(shoes.garment.key).toBe("shoes");
    expect(shoes.box).toEqual({ x0: 6, y0: 8, x1: 9, y1: 10 });
    expect(shoes.share).toBeCloseTo(0.06);
  });

  it("skips garments too small to search", () => {
    const regions = garmentRegions(
      [{ label: "Bag", mask: rect(100, 100, 0, 0, 2, 2) }],
      100,
      100,
    );
    expect(regions).toEqual([]);
  });

  it("keeps the dress or the separates, whichever covers more", () => {
    const separates = garmentRegions(
      [
        { label: "Upper-clothes", mask: rect(10, 10, 0, 0, 10, 4) },
        { label: "Pants", mask: rect(10, 10, 0, 5, 10, 10) },
        { label: "Dress", mask: rect(10, 10, 0, 4, 2, 5) },
      ],
      10,
      10,
    );
    expect(separates.map((r) => r.garment.key)).toEqual(["top", "bottom"]);
    const dress = garmentRegions(
      [
        { label: "Dress", mask: rect(10, 10, 0, 0, 10, 8) },
        { label: "Upper-clothes", mask: rect(10, 10, 0, 8, 2, 9) },
      ],
      10,
      10,
    );
    expect(dress.map((r) => r.garment.key)).toEqual(["dress"]);
  });
});

describe("cutoutFrame", () => {
  it("frames the garment at 3:4 with a margin, centred", () => {
    const frame = cutoutFrame({ x0: 0, y0: 0, x1: 100, y1: 100 }, 0);
    expect(frame.x1 - frame.x0).toBe(100);
    expect(frame.y1 - frame.y0).toBeCloseTo(133.3, -1);
    expect((frame.y0 + frame.y1) / 2).toBeCloseTo(50, 0);
  });
});

describe("cutOut", () => {
  it("keeps the garment's pixels and turns everything else white", () => {
    // 4 × 4 RGBA photo, all red; the garment is the 2 × 2 centre.
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) data.set([255, 0, 0, 255], i * 4);
    const [region] = garmentRegions(
      [{ label: "Upper-clothes", mask: rect(4, 4, 1, 1, 3, 3) }],
      4,
      4,
    );
    const cut = cutOut(data, 4, 4, 4, region, { isolate: true });
    expect(cut.width / cut.height).toBeCloseTo(3 / 4, 0);
    const pixels = Array.from({ length: cut.width * cut.height }, (_, p) =>
      Array.from(cut.data.subarray(p * 3, p * 3 + 3)).join(","),
    );
    expect(pixels.filter((p) => p === "255,0,0")).toHaveLength(4);
    expect(pixels.filter((p) => p === "255,255,255")).toHaveLength(
      pixels.length - 4,
    );
    // Without isolate, the whole frame inside the photo is kept.
    const framed = cutOut(data, 4, 4, 4, region);
    expect(
      Array.from(
        { length: framed.width * framed.height },
        (_, p) => framed.data[p * 3 + 1],
      ).filter((g) => g === 0).length,
    ).toBeGreaterThan(4);
  });
});
