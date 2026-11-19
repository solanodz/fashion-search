import "server-only";

import type { QdrantClient } from "@qdrant/js-client-rest";

import type { CatalogItem } from "@/lib/indexing/catalog";

import type { SearchFilters, SearchResult } from "./schema";

/** Qdrant filter matching every given field exactly. */
export function toQdrantFilter(filters: SearchFilters) {
  const must = Object.entries(filters)
    .filter(([, value]) => value)
    .map(([key, value]) => ({ key, match: { value: value as string } }));
  return must.length > 0 ? { must } : undefined;
}

export async function searchProducts(
  client: QdrantClient,
  collection: string,
  {
    vector,
    filters,
    limit,
  }: { vector: number[]; filters: SearchFilters; limit: number },
): Promise<SearchResult[]> {
  const { points } = await client.query(collection, {
    query: vector,
    filter: toQdrantFilter(filters),
    limit,
    with_payload: true,
  });
  return points.map((point) => ({
    id: Number(point.id),
    score: point.score,
    product: point.payload as CatalogItem,
  }));
}
