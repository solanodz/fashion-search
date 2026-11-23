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

/** Values to leave out of the results: "anything but black". */
export const searchExcludeSchema = z
  .object({ baseColour: z.array(z.string().min(1)).min(1).max(10) })
  .partial();

const vectorSchema = z.array(z.number().finite()).length(CLIP_DIMENSIONS);

/** The pieces of a combined query, scored separately against each result. */
export const QUERY_PARTS = ["photo", "text"] as const;
export type QueryPart = (typeof QUERY_PARTS)[number];

export const searchRequestSchema = z.object({
  vector: vectorSchema,
  filters: searchFiltersSchema.default({}),
  exclude: searchExcludeSchema.optional(),
  limit: z.number().int().min(1).max(60).default(36),
  parts: z
    .array(z.object({ name: z.enum(QUERY_PARTS), vector: vectorSchema }))
    .max(QUERY_PARTS.length)
    .optional(),
  /** Keyword vector of the query text, hashed in the browser (ADR 0009). */
  compare: z.boolean().optional(),
  keywords: z
    .object({
      indices: z
        .array(
          z
            .number()
            .int()
            .min(0)
            .max(2 ** 32 - 1),
        )
        .max(64),
      values: z.array(z.number().finite()).max(64),
    })
    .refine((v) => v.indices.length === v.values.length, {
      message: "indices and values must have the same length",
    })
    .optional(),
});

/** Which search found a result: the image vectors, the keyword vectors, or both. */
export type Signal = "image" | "keywords";

export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type SearchExclude = z.infer<typeof searchExcludeSchema>;
export type SearchRequest = z.input<typeof searchRequestSchema>;

export type SearchResult = {
  id: number;
  /** Cosine similarity to the (combined) query vector. */
  score: number;
  product: CatalogItem;
  /** Cosine similarity to each part of a combined query, when parts were sent. */
  parts?: Partial<Record<QueryPart, number>>;
  /** Present on hybrid searches. */
  signals?: Signal[];
  /** BM25 score, in the keyword list of compare mode. */
  keywordScore?: number;
  /** Compare mode: the result's rank in each list before fusion (1-based). */
  ranks?: Partial<Record<Signal, number>>;
};
export type SearchResponse = {
  results: SearchResult[];
  /** Compare mode: the image and keyword lists before fusion. */
  lists?: { image: SearchResult[]; keywords: SearchResult[] };
};
