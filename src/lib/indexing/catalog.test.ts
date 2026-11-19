import { describe, expect, test } from "vitest";

import { isJpeg, normalizeRow } from "./catalog";

const validRow = {
  id: BigInt(15970),
  productDisplayName: "  Turtle Check Men  Navy Blue Shirt ",
  gender: "Men",
  masterCategory: "Apparel",
  subCategory: "Topwear",
  articleType: "Shirts",
  baseColour: "Navy Blue",
  season: "Fall",
  year: 2011,
  usage: "Casual",
};

describe("normalizeRow", () => {
  test("converts BigInt ids and collapses whitespace", () => {
    const result = normalizeRow(validRow);
    expect(result).toEqual({
      ok: true,
      item: {
        id: 15970,
        name: "Turtle Check Men Navy Blue Shirt",
        gender: "Men",
        masterCategory: "Apparel",
        subCategory: "Topwear",
        articleType: "Shirts",
        baseColour: "Navy Blue",
        season: "Fall",
        year: 2011,
        usage: "Casual",
      },
    });
  });

  test("turns empty, NA and NaN optional values into null", () => {
    const result = normalizeRow({
      ...validRow,
      baseColour: "",
      season: "NA",
      year: Number.NaN,
      usage: null,
    });
    expect(result.ok && result.item).toMatchObject({
      baseColour: null,
      season: null,
      year: null,
      usage: null,
    });
  });

  test("skips rows without an id or a required field", () => {
    expect(normalizeRow({ ...validRow, id: null })).toEqual({
      ok: false,
      reason: "invalid id",
    });
    expect(normalizeRow({ ...validRow, articleType: " " })).toEqual({
      ok: false,
      reason: "missing required field",
    });
  });
});

describe("isJpeg", () => {
  test("detects the JPEG signature", () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(false);
    expect(isJpeg(undefined)).toBe(false);
  });
});
