import { describe, expect, test } from "vitest";

import { toQdrantFilter } from "./search";

describe("toQdrantFilter", () => {
  test("matches every given field and skips empty ones", () => {
    expect(
      toQdrantFilter({
        gender: "Women",
        baseColour: "Red",
        articleType: undefined,
      }),
    ).toEqual({
      must: [
        { key: "gender", match: { value: "Women" } },
        { key: "baseColour", match: { value: "Red" } },
      ],
    });
  });

  test("returns no filter when nothing is selected", () => {
    expect(toQdrantFilter({})).toBeUndefined();
  });
});
