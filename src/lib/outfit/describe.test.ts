import { describe, expect, it } from "vitest";

import {
  describeBodySchema,
  describeRequest,
  parseDescribeResponse,
} from "./describe";

const reply = (text: string) => ({
  output: [
    { type: "reasoning", content: [] },
    { type: "message", content: [{ type: "output_text", text }] },
  ],
});

describe("describeRequest", () => {
  it("sends the photo at low detail with a strict JSON schema", () => {
    const body = describeRequest("gpt-6-luna", "data:image/jpeg;base64,AAAA");
    expect(body.model).toBe("gpt-6-luna");
    expect(body.input[0].content[1]).toEqual({
      type: "input_image",
      image_url: "data:image/jpeg;base64,AAAA",
      detail: "low",
    });
    expect(body.text.format.strict).toBe(true);
    expect(body.store).toBe(false);
  });
});

describe("parseDescribeResponse", () => {
  it("reads the validated description from the output text", () => {
    const description = parseDescribeResponse(
      reply(
        JSON.stringify({
          gender: "Women",
          garments: [
            {
              slot: "top",
              articleType: "Jackets",
              colour: "Maroon",
              description: "maroon checked long wool coat",
            },
          ],
        }),
      ),
    );
    expect(description.garments[0].articleType).toBe("Jackets");
  });

  it("rejects values outside the catalog's vocabulary", () => {
    expect(() =>
      parseDescribeResponse(
        reply(
          JSON.stringify({
            gender: "Women",
            garments: [
              {
                slot: "top",
                articleType: "Coats",
                colour: "Red",
                description: "x",
              },
            ],
          }),
        ),
      ),
    ).toThrow();
  });

  it("fails when there is no output text", () => {
    expect(() => parseDescribeResponse({ output: [] })).toThrow(
      "no description",
    );
  });
});

describe("describeBodySchema", () => {
  it("accepts image data URLs only", () => {
    expect(
      describeBodySchema.safeParse({ image: "data:image/png;base64,AAAA" })
        .success,
    ).toBe(true);
    expect(
      describeBodySchema.safeParse({ image: "https://example.com/a.jpg" })
        .success,
    ).toBe(false);
  });
});
