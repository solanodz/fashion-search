import { describe, expect, it } from "vitest";

import type { Reading } from "./attributes";
import { blend, planQueries } from "./query";

const reading = (
  text: string,
  type: string | null,
  typeConfidence: number,
): Reading => ({
  colour: "Red",
  colourConfidence: 0.4,
  type,
  typeConfidence,
  text,
});

describe("planQueries", () => {
  it("prefers the description and its type over CLIP's reading", () => {
    const [top] = planQueries(
      [{ key: "top", reading: reading("Red Shirts", "Shirts", 0.9) }],
      {
        gender: "Women",
        garments: [
          {
            slot: "top",
            articleType: "Jackets",
            colour: "Maroon",
            description: "maroon checked long wool coat",
          },
        ],
      },
      "Women",
    );
    expect(top).toMatchObject({
      found: 0,
      source: "description",
      text: "maroon checked long wool coat",
      filters: {
        subCategory: "Topwear",
        articleType: "Jackets",
        gender: "Women",
      },
    });
  });

  it("filters on CLIP's type only when it is confident", () => {
    const [sure, unsure] = planQueries(
      [
        { key: "top", reading: reading("Red Jackets", "Jackets", 0.7) },
        { key: "bottom", reading: reading("Blue Jeans", "Jeans", 0.3) },
      ],
      null,
      "Any",
    );
    expect(sure.filters).toEqual({
      subCategory: "Topwear",
      articleType: "Jackets",
    });
    expect(unsure.filters).toEqual({ subCategory: "Bottomwear" });
  });

  it("uses the description's gender when none is chosen", () => {
    const [top] = planQueries(
      [{ key: "top", reading: reading("Red Jackets", "Jackets", 0.7) }],
      { gender: "Women", garments: [] },
      "Any",
    );
    expect(top.filters.gender).toBe("Women");
  });

  it("searches described garments the segmentation missed, by text alone", () => {
    const queries = planQueries(
      [],
      {
        gender: "Women",
        garments: [
          {
            slot: "shoes",
            articleType: "Casual Shoes",
            colour: "Brown",
            description: "brown suede ankle boots",
          },
        ],
      },
      "Any",
    );
    expect(queries).toEqual([
      expect.objectContaining({
        key: "shoes",
        found: null,
        source: "description",
      }),
    ]);
  });
});

describe("blend", () => {
  it("weights the text and returns a unit vector", () => {
    const v = blend([1, 0], [0, 1], 1);
    expect(v[0]).toBeCloseTo(Math.SQRT1_2);
    expect(Math.hypot(...v)).toBeCloseTo(1);
    expect(Array.from(blend(null, [0, 3]))).toEqual([0, 1]);
  });
});
