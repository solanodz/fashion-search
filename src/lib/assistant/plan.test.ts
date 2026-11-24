import { describe, expect, it } from "vitest";

import {
  MAX_REQUEST_LENGTH,
  parsePlanResponse,
  planBodySchema,
  planQueries,
  planRequest,
  type ShoppingPlan,
} from "./plan";

const reply = (text: string) => ({
  output: [
    { type: "reasoning", content: [] },
    { type: "message", content: [{ type: "output_text", text }] },
  ],
});

const plan: ShoppingPlan = {
  summary: "Outfit de hombre para una boda de verano, sin negro.",
  gender: "Men",
  searches: [
    {
      title: "Camisa",
      query: "light blue linen formal shirt",
      articleType: "Shirts",
      avoidColours: ["Black", "Black"],
    },
    {
      title: "Zapatos",
      query: "brown leather formal shoes",
      articleType: null,
      avoidColours: [],
    },
  ],
};

describe("planRequest", () => {
  it("sends the request as user text with a strict JSON schema", () => {
    const body = planRequest("gpt-6-luna", "a raincoat for hiking");
    expect(body.model).toBe("gpt-6-luna");
    expect(body.input[0].content).toEqual([
      { type: "input_text", text: "a raincoat for hiking" },
    ]);
    expect(body.text.format.strict).toBe(true);
    expect(body.store).toBe(false);
    // The shopper's words never join the instructions.
    expect(body.instructions).not.toContain("raincoat");
  });
});

describe("parsePlanResponse", () => {
  it("reads the validated plan from the output text", () => {
    expect(parsePlanResponse(reply(JSON.stringify(plan)))).toEqual(plan);
  });

  it("accepts a plan with no searches, for requests it can't shop for", () => {
    const empty = { summary: "I can only search the catalog.", gender: null };
    expect(
      parsePlanResponse(reply(JSON.stringify({ ...empty, searches: [] })))
        .searches,
    ).toEqual([]);
  });

  it("rejects values outside the catalog's vocabulary", () => {
    const wrongType = structuredClone(plan) as unknown as {
      searches: { articleType: string }[];
    };
    wrongType.searches[0].articleType = "Tuxedos";
    expect(() => parsePlanResponse(reply(JSON.stringify(wrongType)))).toThrow();
    expect(() =>
      parsePlanResponse(reply(JSON.stringify({ ...plan, gender: "Dogs" }))),
    ).toThrow();
  });

  it("rejects more searches than a plan allows", () => {
    const searches = Array.from({ length: 6 }, () => plan.searches[1]);
    expect(() =>
      parsePlanResponse(reply(JSON.stringify({ ...plan, searches }))),
    ).toThrow();
  });

  it("fails when there is no output text", () => {
    expect(() => parsePlanResponse({ output: [] })).toThrow("no plan");
  });
});

describe("planBodySchema", () => {
  it("trims the request and bounds its length", () => {
    expect(planBodySchema.parse({ request: "  a red dress  " }).request).toBe(
      "a red dress",
    );
    expect(planBodySchema.safeParse({ request: " a " }).success).toBe(false);
    expect(
      planBodySchema.safeParse({ request: "x".repeat(MAX_REQUEST_LENGTH + 1) })
        .success,
    ).toBe(false);
  });
});

describe("planQueries", () => {
  it("turns each planned search into filters and exclusions", () => {
    expect(planQueries(plan)).toEqual([
      {
        title: "Camisa",
        query: "light blue linen formal shirt",
        filters: { gender: "Men", articleType: "Shirts" },
        exclude: { baseColour: ["Black"] },
      },
      {
        title: "Zapatos",
        query: "brown leather formal shoes",
        filters: { gender: "Men" },
        exclude: {},
      },
    ]);
  });

  it("adds no gender filter when the plan has none", () => {
    expect(planQueries({ ...plan, gender: null })[1].filters).toEqual({});
  });
});
