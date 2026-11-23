import { describe, expect, it } from "vitest";

import { type Neighbour, suggestTags } from "./suggest";

const neighbour = (
  score: number,
  articleType: string,
  baseColour: string | null = "Blue",
): Neighbour => ({ score, product: { articleType, baseColour } });

describe("suggestTags", () => {
  it("suggests the value most neighbours have, with its share of the vote", () => {
    const { articleType } = suggestTags(
      [
        neighbour(0.9, "Shirts"),
        neighbour(0.9, "Shirts"),
        neighbour(0.9, "Tshirts"),
        neighbour(0.9, "Shirts"),
      ],
      { temperature: null },
    );
    expect(articleType).toEqual({
      value: "Shirts",
      confidence: 0.75,
      alternatives: [{ value: "Tshirts", share: 0.25 }],
    });
  });

  it("counts closer neighbours more", () => {
    const votes = [
      neighbour(0.95, "Heels"),
      neighbour(0.85, "Flats"),
      neighbour(0.85, "Flats"),
    ];
    expect(suggestTags(votes, { temperature: null }).articleType?.value).toBe(
      "Flats",
    );
    // 0.1 less similar is e^5 times less weight: the closest one wins.
    const weighted = suggestTags(votes, { temperature: 0.02 }).articleType;
    expect(weighted?.value).toBe("Heels");
    expect(weighted?.confidence).toBeGreaterThan(0.98);
  });

  it("uses only the closest voters, whatever the order given", () => {
    const { articleType } = suggestTags(
      [
        neighbour(0.5, "Socks"),
        neighbour(0.5, "Socks"),
        neighbour(0.9, "Watches"),
      ],
      { voters: 1, temperature: null },
    );
    expect(articleType?.value).toBe("Watches");
    expect(articleType?.confidence).toBe(1);
  });

  it("votes the colour by colour similarity when neighbours have one", () => {
    // The two closest by shape are red; the photo's colours match the blue one.
    const neighbours: Neighbour[] = [
      { ...neighbour(0.95, "Shirts", "Red"), colourSimilarity: 0.1 },
      { ...neighbour(0.94, "Shirts", "Red"), colourSimilarity: 0.15 },
      { ...neighbour(0.9, "Shirts", "Blue"), colourSimilarity: 0.85 },
    ];
    const suggestions = suggestTags(neighbours);
    expect(suggestions.baseColour?.value).toBe("Blue");
    expect(suggestions.baseColour?.confidence).toBeGreaterThan(0.99);
    // The other fields still go by shape.
    expect(suggestions.articleType?.value).toBe("Shirts");
    // Without similarities, the colour is voted like any other field.
    expect(
      suggestTags(neighbours.map(({ score, product }) => ({ score, product })))
        .baseColour?.value,
    ).toBe("Red");
  });

  it("ignores neighbours without a value and has no suggestion without votes", () => {
    const suggestions = suggestTags(
      [neighbour(0.9, "Shirts", null), neighbour(0.8, "Shirts", "Red")],
      { temperature: null },
    );
    expect(suggestions.baseColour).toEqual({
      value: "Red",
      confidence: 1,
      alternatives: [],
    });
    expect(suggestions.season).toBeNull();
    expect(suggestTags([]).articleType).toBeNull();
  });
});
