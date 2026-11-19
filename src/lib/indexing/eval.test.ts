import { describe, expect, test } from "vitest";

import type { CatalogItem } from "./catalog";
import { scoreQuery, summarize } from "./eval";

const product = (articleType: string, baseColour: string, gender = "Women") =>
  ({ articleType, baseColour, gender }) as CatalogItem;

describe("scoreQuery", () => {
  test("computes precision@k per checked attribute and for all of them", () => {
    const results = [
      product("Dresses", "Red"),
      product("Nightdress", "Red"),
      product("Dresses", "Blue"),
      product("Tops", "Green"),
    ];
    expect(
      scoreQuery({ articleType: ["Dresses"], baseColour: ["Red"] }, results, 4),
    ).toEqual({
      articleType: 0.5,
      baseColour: 0.5,
      all: 0.25,
    });
  });

  test("accepts any of several values and ignores unchecked attributes", () => {
    const results = [
      product("Casual Shoes", "Black", "Men"),
      product("Sports Shoes", "Black", "Women"),
    ];
    expect(
      scoreQuery({ articleType: ["Casual Shoes", "Sports Shoes"] }, results, 2),
    ).toEqual({
      articleType: 1,
      all: 1,
    });
  });

  test("counts missing results as misses", () => {
    expect(
      scoreQuery({ baseColour: ["Red"] }, [product("Dresses", "Red")], 10),
    ).toEqual({
      baseColour: 0.1,
      all: 0.1,
    });
  });
});

describe("summarize", () => {
  test("averages each metric over the queries that define it", () => {
    expect(
      summarize([
        { articleType: 1, all: 0.5 },
        { articleType: 0.5, gender: 1, all: 0.5 },
      ]),
    ).toEqual({
      articleType: 0.75,
      gender: 1,
      all: 0.5,
    });
  });
});
