import { describe, expect, it } from "vitest";

import type { CatalogItem } from "../indexing/catalog";

import {
  averageLength,
  documentKeywords,
  hashToken,
  productText,
  queryKeywords,
  tokenize,
} from "./keywords";

const dress: CatalogItem = {
  id: 1,
  name: "Vero Moda Women Red Dress",
  gender: "Women",
  masterCategory: "Apparel",
  subCategory: "Dress",
  articleType: "Dresses",
  baseColour: "Red",
  season: null,
  year: null,
  usage: null,
};

describe("tokenize", () => {
  it("lower-cases, drops stopwords and stems plurals", () => {
    expect(tokenize("A red dress for Men's running SHOES")).toEqual([
      "red",
      "dress",
      "men",
      "running",
      "shoe",
    ]);
    expect(tokenize("dresses jeans glass")).toEqual(["dress", "jean", "glass"]);
  });

  it("splits on punctuation and keeps digits", () => {
    expect(tokenize("Polo, 3/4th sleeves")).toEqual(["polo", "4th", "sleeve"]);
  });

  it("treats every spelling of t-shirt as one word", () => {
    for (const text of ["T-shirt", "t shirt", "Tshirts"]) {
      expect(tokenize(text)).toEqual(["tshirt"]);
    }
  });
});

it("hashes tokens to stable unsigned 32-bit indices", () => {
  expect(hashToken("dress")).toBe(hashToken("dress"));
  expect(hashToken("dress")).not.toBe(hashToken("shoe"));
  expect(hashToken("dress")).toBeGreaterThanOrEqual(0);
  expect(hashToken("dress")).toBeLessThan(2 ** 32);
});

describe("documentKeywords", () => {
  it("weights repeated tokens more, with saturation", () => {
    const vector = documentKeywords(dress, averageLength([dress]));
    const weight = (token: string) =>
      vector.values[vector.indices.indexOf(hashToken(token))];
    // "dress" appears in the name and the type, "red" in name and colour,
    // "moda" once.
    expect(weight("dress")).toBeGreaterThan(weight("moda"));
    expect(weight("dress")).toBeLessThan(2.2);
    expect(vector.indices).toEqual([...vector.indices].sort((a, b) => a - b));
  });

  it("matches the product text", () => {
    expect(productText(dress)).toBe(
      "Vero Moda Women Red Dress Dresses Red Women",
    );
  });
});

describe("queryKeywords", () => {
  it("gives each distinct token a weight of 1", () => {
    const vector = queryKeywords("red dress red");
    expect(vector?.values).toEqual([1, 1]);
    expect(new Set(vector?.indices)).toEqual(
      new Set([hashToken("red"), hashToken("dress")]),
    );
  });

  it("is null without usable tokens", () => {
    expect(queryKeywords("in a")).toBeNull();
    expect(queryKeywords("")).toBeNull();
  });
});
