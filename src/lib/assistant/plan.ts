import { z } from "zod";

import { outputText } from "../openai.ts";
import type { SearchExclude, SearchFilters } from "../search/schema.ts";

/**
 * Shopping assistant (ADR 0014): a small language model turns a request in
 * plain language ("an outfit for a summer wedding, for a man, nothing
 * black") into a plan of catalog searches. The model only plans; every
 * search then runs like any other, with CLIP in the browser and Qdrant.
 * Request building and response parsing only; the call is in /api/plan.
 */

/** Longest request sent to the model. */
export const MAX_REQUEST_LENGTH = 300;

/** Searches in a plan: enough for an outfit, few enough to read. */
export const MAX_SEARCHES = 5;

/**
 * Catalog article types the model can filter on: every type with at least
 * 80 products, 96% of the catalog (counted on data/catalog.jsonl, Nov 2026).
 */
export const PLAN_ARTICLE_TYPES = [
  "Tshirts",
  "Shirts",
  "Casual Shoes",
  "Watches",
  "Sports Shoes",
  "Kurtas",
  "Handbags",
  "Tops",
  "Heels",
  "Sunglasses",
  "Flip Flops",
  "Sandals",
  "Wallets",
  "Belts",
  "Briefs",
  "Backpacks",
  "Socks",
  "Formal Shoes",
  "Perfume and Body Mist",
  "Jeans",
  "Flats",
  "Shorts",
  "Trousers",
  "Bra",
  "Dresses",
  "Sarees",
  "Earrings",
  "Deodorant",
  "Track Pants",
  "Clutches",
  "Sweatshirts",
  "Caps",
  "Sweaters",
  "Ties",
  "Jackets",
  "Innerwear Vests",
  "Kurtis",
  "Tunics",
  "Nail Polish",
  "Nightdress",
  "Pendant",
  "Leggings",
  "Necklace and Chains",
  "Capris",
  "Night suits",
  "Scarves",
  "Ring",
  "Trunk",
  "Skirts",
  "Dupatta",
  "Cufflinks",
  "Lipstick",
  "Kurta Sets",
  "Stoles",
  "Duffel Bag",
  "Bangle",
  "Lip Gloss",
  "Laptop Bag",
] as const;

/** Catalog colours the model can exclude: the 24 most common ones. */
export const PLAN_COLOURS = [
  "Black",
  "White",
  "Blue",
  "Brown",
  "Grey",
  "Red",
  "Green",
  "Navy Blue",
  "Pink",
  "Purple",
  "Silver",
  "Yellow",
  "Beige",
  "Gold",
  "Maroon",
  "Orange",
  "Olive",
  "Multi",
  "Cream",
  "Steel",
  "Charcoal",
  "Off White",
  "Peach",
  "Lavender",
] as const;

/** The catalog's genders, except Unisex. */
export const PLAN_GENDERS = ["Men", "Women", "Boys", "Girls"] as const;

export const plannedSearchSchema = z.object({
  /** What this search is for, in the shopper's language: "Camisa". */
  title: z.string().min(1).max(60),
  /** The search text, in English catalog words: "light blue linen shirt". */
  query: z.string().min(1).max(120),
  articleType: z.enum(PLAN_ARTICLE_TYPES).nullable(),
  avoidColours: z.array(z.enum(PLAN_COLOURS)).max(6),
});

export const shoppingPlanSchema = z.object({
  /** What the model understood, in the shopper's language. */
  summary: z.string().min(1).max(240),
  gender: z.enum(PLAN_GENDERS).nullable(),
  searches: z.array(plannedSearchSchema).max(MAX_SEARCHES),
});

export type PlannedSearch = z.infer<typeof plannedSearchSchema>;
export type ShoppingPlan = z.infer<typeof shoppingPlanSchema>;

const INSTRUCTIONS = `You plan searches in a fashion catalog (clothes, shoes, bags, watches, jewellery, accessories, some cosmetics) for a shopper's request. You do not answer the shopper: a search engine runs your plan.
Write summary and every title in the language the shopper wrote in: an English request gets English, a Spanish request gets Spanish.
Return:
- summary: one short sentence in the shopper's language restating the request as you understood it, including anything to avoid, for example "A summer wedding outfit for a man, nothing black." Don't mention what the shopper didn't say.
- gender: who the products are for, or null when the request doesn't say.
- searches: one per kind of product to find, at most ${MAX_SEARCHES}. For an outfit or clothes for an activity, one per piece, three to five (for example shirt, trousers, shoes, belt). For a gift or an open need, two or three different kinds of product. For one specific product, a single search. Each has:
  - title: two or three words in the shopper's language naming the piece.
  - query: at most 8 English words a product name in the catalog would use: colour, material, style, type (for example "light blue linen formal shirt"). Fit the occasion, season and age in the request. Never use a colour the shopper wants to avoid.
  - articleType: the catalog type that fits best, or null when none fits.
  - avoidColours: catalog colours the shopper ruled out, or an empty list.
If the request is not about finding products like these, return no searches and say so in the summary.`;

/** JSON Schema for Structured Outputs (strict: every field required). */
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "gender", "searches"],
  properties: {
    summary: { type: "string" },
    gender: { type: ["string", "null"], enum: [...PLAN_GENDERS, null] },
    searches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "query", "articleType", "avoidColours"],
        properties: {
          title: { type: "string" },
          query: { type: "string" },
          articleType: {
            type: ["string", "null"],
            enum: [...PLAN_ARTICLE_TYPES, null],
          },
          avoidColours: {
            type: "array",
            items: { type: "string", enum: PLAN_COLOURS },
          },
        },
      },
    },
  },
};

/** Body of a Responses API request planning the searches for a request. */
export function planRequest(model: string, request: string) {
  return {
    model,
    instructions: INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: request }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "shopping_plan",
        strict: true,
        schema: JSON_SCHEMA,
      },
    },
    max_output_tokens: 700,
    store: false,
  };
}

/** The validated plan in a Responses API reply, or an error. */
export function parsePlanResponse(reply: unknown): ShoppingPlan {
  const text = outputText(reply);
  if (!text) throw new Error("The model returned no plan.");
  return shoppingPlanSchema.parse(JSON.parse(text));
}

/** Request body of /api/plan. */
export const planBodySchema = z.object({
  request: z.string().trim().min(3).max(MAX_REQUEST_LENGTH),
});

/** One search of a plan, ready for /api/search. */
export type PlanQuery = {
  title: string;
  query: string;
  filters: SearchFilters;
  exclude: SearchExclude;
};

/** What each planned search is run with. */
export function planQueries(plan: ShoppingPlan): PlanQuery[] {
  return plan.searches.map(({ title, query, articleType, avoidColours }) => ({
    title,
    query,
    filters: {
      ...(plan.gender ? { gender: plan.gender } : {}),
      ...(articleType ? { articleType } : {}),
    },
    exclude:
      avoidColours.length > 0 ? { baseColour: [...new Set(avoidColours)] } : {},
  }));
}
