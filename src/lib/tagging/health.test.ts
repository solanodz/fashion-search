import { describe, expect, it } from "vitest";

import { contradictedType } from "./health";
import type { Neighbour } from "./suggest";

const neighbours = (...types: string[]): Neighbour[] =>
  types.map((articleType) => ({ score: 0.9, product: { articleType } }));

describe("contradictedType", () => {
  it("flags a label that nearly every neighbour contradicts", () => {
    expect(
      contradictedType(
        { articleType: "Free Gifts" },
        neighbours(...Array.from({ length: 10 }, () => "Watches")),
      ),
    ).toEqual({ looksLike: "Watches", share: 1 });
  });

  it("says nothing when the neighbours agree with the label", () => {
    expect(
      contradictedType(
        { articleType: "Watches" },
        neighbours("Watches", "Watches", "Watches"),
      ),
    ).toBeNull();
  });

  it("says nothing when the neighbours are split", () => {
    const split = neighbours(
      ...Array.from({ length: 6 }, () => "Casual Shoes"),
      ...Array.from({ length: 4 }, () => "Sports Shoes"),
    );
    expect(contradictedType({ articleType: "Sports Shoes" }, split)).toBeNull();
    expect(contradictedType({ articleType: "Flats" }, split)).toBeNull();
    // A lower bar flags it.
    expect(contradictedType({ articleType: "Flats" }, split, 0.5)).toEqual({
      looksLike: "Casual Shoes",
      share: 0.6,
    });
  });

  it("says nothing without neighbours", () => {
    expect(contradictedType({ articleType: "Flats" }, [])).toBeNull();
  });
});
