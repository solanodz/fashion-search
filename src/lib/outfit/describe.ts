import { z } from "zod";

import { COLOURS, TYPES } from "./attributes.ts";
import { GARMENTS } from "./garments.ts";

/**
 * Optional outfit description by a small vision language model (ADR 0013):
 * it names each garment in catalog words ("Maroon checked long wool coat"),
 * which the outfit search adds to each garment's query as text. Request
 * building and response parsing only; the call is in /api/describe.
 */

/** OpenAI's cheapest vision model at the time of writing (Nov 2026). */
export const DEFAULT_DESCRIBE_MODEL = "gpt-6-luna";

const SLOTS = GARMENTS.map((g) => g.key) as [string, ...string[]];
const ARTICLE_TYPES = [
  ...new Set(Object.values(TYPES).flatMap((types) => types.map((t) => t.type))),
] as unknown as [string, ...string[]];
const DESCRIBE_COLOURS = [...COLOURS, "Multi"] as unknown as [
  string,
  ...string[],
];

export const describedGarmentSchema = z.object({
  slot: z.enum(SLOTS),
  articleType: z.enum(ARTICLE_TYPES).nullable(),
  colour: z.enum(DESCRIBE_COLOURS),
  description: z.string().min(1).max(120),
});

export const outfitDescriptionSchema = z.object({
  gender: z.enum(["Women", "Men", "Unisex"]),
  garments: z.array(describedGarmentSchema).max(GARMENTS.length),
});

export type DescribedGarment = z.infer<typeof describedGarmentSchema>;
export type OutfitDescription = z.infer<typeof outfitDescriptionSchema>;

const INSTRUCTIONS = `You describe the clothes a person wears in a photo, for a product search in a fashion catalog.
List each visible item once, with:
- slot: where it is worn (${SLOTS.join(", ")}). A coat or jacket is a "top"; "bottom" is trousers, jeans, shorts or a skirt.
- articleType: the catalog type that fits best, or null when none fits.
- colour: its main colour, from the list.
- description: at most 10 English words a catalog product name would use: colour, pattern, material, fit, length (e.g. "maroon checked long wool coat", "light blue wide leg jeans").
gender: who the outfit is for, judging by the clothes.
Skip anything not clearly visible.`;

/** JSON Schema for Structured Outputs (strict: every field required). */
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["gender", "garments"],
  properties: {
    gender: { type: "string", enum: ["Women", "Men", "Unisex"] },
    garments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slot", "articleType", "colour", "description"],
        properties: {
          slot: { type: "string", enum: SLOTS },
          articleType: {
            type: ["string", "null"],
            enum: [...ARTICLE_TYPES, null],
          },
          colour: { type: "string", enum: DESCRIBE_COLOURS },
          description: { type: "string" },
        },
      },
    },
  },
};

/** Body of a Responses API request describing the photo (a data: URL). */
export function describeRequest(model: string, imageDataUrl: string) {
  return {
    model,
    instructions: INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "Describe this outfit." },
          { type: "input_image", image_url: imageDataUrl, detail: "low" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "outfit",
        strict: true,
        schema: JSON_SCHEMA,
      },
    },
    max_output_tokens: 600,
    store: false,
  };
}

/** The validated description in a Responses API reply, or an error. */
export function parseDescribeResponse(body: unknown): OutfitDescription {
  const output = (body as { output?: unknown[] })?.output ?? [];
  const text = output
    .flatMap(
      (item) =>
        (item as { content?: { type: string; text?: string }[] }).content ?? [],
    )
    .find((part) => part.type === "output_text")?.text;
  if (!text) throw new Error("The model returned no description.");
  return outfitDescriptionSchema.parse(JSON.parse(text));
}

/** Request body of /api/describe: a JPEG or PNG photo as a data: URL. */
export const describeBodySchema = z.object({
  image: z
    .string()
    .max(700_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
});
