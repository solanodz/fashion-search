import "server-only";

import type { QdrantClient } from "@qdrant/js-client-rest";

import type { SearchFilters } from "./schema";
import { toQdrantFilter } from "./search";

/** Filters shown in the UI, in display order. */
export const FACET_FIELDS = [
  "gender",
  "masterCategory",
  "articleType",
  "baseColour",
] as const;
export type FacetField = (typeof FACET_FIELDS)[number];

export type FacetValue = { value: string; count: number };
export type Facets = Record<FacetField, FacetValue[]>;

/**
 * Available values and counts for every filter, given the current selection.
 * Each field is counted with the other fields' filters applied but not its
 * own, so picking "Women" still lists "Men" as an alternative.
 */
export async function getFacets(
  client: QdrantClient,
  collection: string,
  filters: SearchFilters,
): Promise<Facets> {
  const entries = await Promise.all(
    FACET_FIELDS.map(async (field) => {
      const others = { ...filters, [field]: undefined };
      const { hits } = await client.facet(collection, {
        key: field,
        filter: toQdrantFilter(others),
        limit: 200,
        exact: true,
      });
      return [
        field,
        hits.map((hit) => ({ value: String(hit.value), count: hit.count })),
      ] as const;
    }),
  );
  return Object.fromEntries(entries) as Facets;
}
