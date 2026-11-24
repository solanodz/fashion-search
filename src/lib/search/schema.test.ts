import { describe, expect, test } from "vitest";

import { searchRequestSchema } from "./schema";

const vector = Array.from({ length: 512 }, () => 0.1);

describe("searchRequestSchema", () => {
  test("applies defaults for filters and limit", () => {
    expect(searchRequestSchema.parse({ vector })).toEqual({
      vector,
      filters: {},
      limit: 36,
    });
  });

  test("rejects vectors with the wrong length or non-finite values", () => {
    expect(searchRequestSchema.safeParse({ vector: [1, 2, 3] }).success).toBe(
      false,
    );
    expect(
      searchRequestSchema.safeParse({
        vector: [...vector.slice(1), Number.NaN],
      }).success,
    ).toBe(false);
  });

  test("accepts colours to exclude, up to ten", () => {
    expect(
      searchRequestSchema.parse({ vector, exclude: { baseColour: ["Black"] } })
        .exclude,
    ).toEqual({ baseColour: ["Black"] });
    expect(
      searchRequestSchema.safeParse({
        vector,
        exclude: { baseColour: Array.from({ length: 11 }, () => "Black") },
      }).success,
    ).toBe(false);
  });

  test("caps the limit and rejects unknown filter values types", () => {
    expect(searchRequestSchema.safeParse({ vector, limit: 500 }).success).toBe(
      false,
    );
    expect(
      searchRequestSchema.safeParse({ vector, filters: { gender: "" } })
        .success,
    ).toBe(false);
  });
});
