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

export const searchRequestSchema = z.object({
  vector: z.array(z.number().finite()).length(CLIP_DIMENSIONS),
  filters: searchFiltersSchema.default({}),
  limit: z.number().int().min(1).max(60).default(36),
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type SearchRequest = z.input<typeof searchRequestSchema>;

export type SearchResult = { id: number; score: number; product: CatalogItem };
export type SearchResponse = { results: SearchResult[] };
