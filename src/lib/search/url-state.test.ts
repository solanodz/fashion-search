import { describe, expect, it } from "vitest";

import { parseSearchState, serializeSearchState } from "./url-state";

describe("search state in the URL", () => {
  it("round-trips a query, filters and a product photo", () => {
    const state = {
      q: "red dress",
      filters: {
        gender: "Women",
        masterCategory: "Apparel",
        articleType: "Dresses",
        baseColour: "Red",
      },
      like: 15970,
      feedback: { like: [25908, 57057], dislike: [52406] },
    };
    const search = serializeSearchState(state);
    expect(search).toBe(
      "?q=red+dress&like=15970&gender=Women&category=Apparel&type=Dresses&colour=Red&up=25908&up=57057&down=52406",
    );
    expect(parseSearchState(new URLSearchParams(search))).toEqual(state);
  });

  it("is empty for an empty search", () => {
    const empty = {
      q: "",
      filters: {},
      like: null,
      feedback: { like: [], dislike: [] },
    };
    expect(serializeSearchState({ ...empty, q: "  " })).toBe("");
    expect(parseSearchState(new URLSearchParams(""))).toEqual(empty);
  });

  it("ignores invalid values", () => {
    const state = parseSearchState(
      new URLSearchParams("q=%20&like=-4&gender=&colour=Blue&unknown=x"),
    );
    expect(state).toEqual({
      q: "",
      filters: { baseColour: "Blue" },
      like: null,
      feedback: { like: [], dislike: [] },
    });
    expect(parseSearchState(new URLSearchParams("like=1.5")).like).toBeNull();
  });

  it("keeps valid marked products, once each and at most ten", () => {
    const { feedback } = parseSearchState(
      new URLSearchParams("up=7&up=7&up=x&up=-2&down=9&down=1.5"),
    );
    expect(feedback).toEqual({ like: [7], dislike: [9] });
    const many = new URLSearchParams(
      Array.from({ length: 14 }, (_, i) => ["up", String(i + 1)]),
    );
    expect(parseSearchState(many).feedback.like).toHaveLength(10);
  });

  it("caps very long values", () => {
    const q = "a".repeat(500);
    expect(parseSearchState(new URLSearchParams({ q })).q).toHaveLength(200);
  });
});
