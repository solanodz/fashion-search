import { z } from "zod";

import { CLIP_DIMENSIONS } from "../clip/config.ts";
import type { CatalogItem } from "../indexing/catalog.ts";

/** Filterable product fields. Keep in sync with FILTER_FIELDS in indexing/collection.ts. */
export const searchFiltersSchema = z
  .object({
    gender: z.string().min(1),
    masterCategory: z.string().min(1),
    subCategory: z.string().min(1),
    articleType: z.string().min(1),
    baseColour: z.string().min(1),
  })
  .partial();

const vectorSchema = z.array(z.number().finite()).length(CLIP_DIMENSIONS);

/** The pieces of a combined query, scored separately against each result. */
export const QUERY_PARTS = ["photo", "text"] as const;
export type QueryPart = (typeof QUERY_PARTS)[number];

export const searchRequestSchema = z.object({
  vector: vectorSchema,
  filters: searchFiltersSchema.default({}),
  limit: z.number().int().min(1).max(60).default(36),
  parts: z
    .array(z.object({ name: z.enum(QUERY_PARTS), vector: vectorSchema }))
    .max(QUERY_PARTS.length)
    .optional(),
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type SearchRequest = z.input<typeof searchRequestSchema>;

export type SearchResult = {
  id: number;
  /** Cosine similarity to the (combined) query vector. */
  score: number;
  product: CatalogItem;
  /** Cosine similarity to each part of a combined query, when parts were sent. */
  parts?: Partial<Record<QueryPart, number>>;
};
export type SearchResponse = { results: SearchResult[] };
