import "server-only";

import type { QdrantClient } from "@qdrant/js-client-rest";

import type { CatalogItem } from "@/lib/indexing/catalog";

import type { QueryPart, SearchFilters, SearchResult } from "./schema";

/** Qdrant filter matching every given field exactly. */
export function toQdrantFilter(filters: SearchFilters) {
  const must = Object.entries(filters)
    .filter(([, value]) => value)
    .map(([key, value]) => ({ key, match: { value: value as string } }));
  return must.length > 0 ? { must } : undefined;
}

/** Cosine similarity of two vectors of the same length. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

/** The dense vector of a point, whether the collection uses one unnamed vector or named ones. */
export function denseVector(vector: unknown): number[] | null {
  if (Array.isArray(vector) && typeof vector[0] === "number") return vector;
  if (vector && typeof vector === "object") {
    for (const value of Object.values(vector)) {
      if (Array.isArray(value) && typeof value[0] === "number") return value;
    }
  }
  return null;
}

type QueryParts = { name: QueryPart; vector: number[] }[];

export async function searchProducts(
  client: QdrantClient,
  collection: string,
  {
    vector,
    filters,
    limit,
    parts,
  }: {
    vector: number[];
    filters: SearchFilters;
    limit: number;
    parts?: QueryParts;
  },
): Promise<SearchResult[]> {
  const breakdown = parts && parts.length > 1;
  const { points } = await client.query(collection, {
    query: vector,
    filter: toQdrantFilter(filters),
    limit,
    with_payload: true,
    // Result vectors are only needed to score the parts of a combined query.
    with_vector: breakdown ? true : false,
  });
  return points.map((point) => {
    const result: SearchResult = {
      id: Number(point.id),
      score: point.score,
      product: point.payload as CatalogItem,
    };
    const stored = breakdown ? denseVector(point.vector) : null;
    if (breakdown && stored) {
      result.parts = Object.fromEntries(
        parts.map((part) => [part.name, cosine(part.vector, stored)]),
      );
    }
    return result;
  });
}
