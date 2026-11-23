import { describe, expect, test } from "vitest";

import type { CatalogItem } from "../indexing/catalog";
import { hasLeaning, leaning, preference, rerank } from "./feedback";

const product = (
  id: number,
  articleType: string,
  baseColour: string | null,
  gender = "Women",
  usage: string | null = "Casual",
) =>
  ({
    id,
    name: `Product ${id}`,
    articleType,
    baseColour,
    gender,
    usage,
  }) as CatalogItem;

describe("leaning", () => {
  test("prefers what every liked product shares", () => {
    const towards = leaning(
      [product(1, "Dresses", "Red"), product(2, "Dresses", "Maroon")],
      [],
    );
    expect(towards.prefer).toEqual({
      articleType: "Dresses",
      gender: "Women",
      usage: "Casual",
    });
    expect(towards.avoid).toEqual({});
  });

  test("avoids a disliked value only where a liked product differs", () => {
    const towards = leaning(
      [product(1, "Dresses", "Red")],
      [product(2, "Dresses", "Black"), product(3, "Tops", "Black", "Men")],
    );
    // Both are dresses or tops, but only "Tops", "Black" and "Men" contrast.
    expect(towards.avoid).toEqual({
      articleType: ["Tops"],
      baseColour: ["Black"],
      gender: ["Men"],
    });
  });

  test("says nothing from dislikes alone", () => {
    const towards = leaning([], [product(2, "Dresses", "Black")]);
    expect(towards).toEqual({ prefer: {}, avoid: {} });
    expect(hasLeaning(towards)).toBe(false);
  });

  test("ignores missing values", () => {
    const towards = leaning(
      [product(1, "Watches", null, "Men", null)],
      [product(2, "Watches", null, "Men", null)],
    );
    expect(towards.prefer).toEqual({ articleType: "Watches", gender: "Men" });
    expect(towards.avoid).toEqual({});
  });
});

describe("preference and rerank", () => {
  const towards = leaning(
    [product(1, "Dresses", "Red")],
    [product(2, "Dresses", "Black")],
  );

  test("scores a point per preferred value and takes one per avoided value", () => {
    expect(preference(product(10, "Dresses", "Red"), towards)).toBe(4);
    expect(preference(product(11, "Dresses", "Blue"), towards)).toBe(3);
    expect(preference(product(12, "Dresses", "Black"), towards)).toBe(2);
    expect(
      preference(product(13, "Tops", "Black", "Men", "Sports"), towards),
    ).toBe(-1);
  });

  test("puts the best fits first and keeps the order of ties", () => {
    const results = [
      { product: product(12, "Dresses", "Black") },
      { product: product(11, "Dresses", "Blue") },
      { product: product(10, "Dresses", "Red") },
      { product: product(14, "Dresses", "Green") },
    ];
    expect(rerank(results, towards).map((r) => r.product.id)).toEqual([
      10, 11, 14, 12,
    ]);
  });
});
