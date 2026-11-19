import type { QdrantClient } from "@qdrant/js-client-rest";

import {
  averageLength,
  documentKeywords,
  type SparseVector,
} from "../search/keywords.ts";
import { IMAGE_VECTOR, KEYWORD_VECTOR } from "../search/query.ts";
import type { CatalogItem } from "./catalog.ts";

/**
 * Versioned collections behind an alias: every upload creates `<alias>_vN`,
 * fills it, then moves the alias in one atomic operation. The app always
 * queries the alias, so re-indexing never serves a half-filled collection,
 * and the previous version stays available for rollback.
 */

/** Payload fields used as search filters. */
export const FILTER_FIELDS = [
  "gender",
  "masterCategory",
  "subCategory",
  "articleType",
  "baseColour",
] as const;

/** A product with its CLIP image vector and its keyword vector (ADR 0009). */
export type Point = {
  id: number;
  vector: { [IMAGE_VECTOR]: number[]; [KEYWORD_VECTOR]: SparseVector };
  payload: CatalogItem;
};

export function versionOf(collection: string, alias: string): number | null {
  const match = new RegExp(`^${escapeRegExp(alias)}_v(\\d+)$`).exec(collection);
  return match ? Number(match[1]) : null;
}

/** Next free `<alias>_vN` given the existing collection names. */
export function nextCollectionName(existing: string[], alias: string): string {
  const versions = existing
    .map((name) => versionOf(name, alias))
    .filter((v): v is number => v !== null);
  return `${alias}_v${Math.max(0, ...versions) + 1}`;
}

/** Joins catalog rows with their vectors. Every catalog item must have exactly one vector. */
export function buildPoints(
  catalog: CatalogItem[],
  vectors: { id: number; vector: Float32Array }[],
): Point[] {
  const byId = new Map(vectors.map(({ id, vector }) => [id, vector]));
  const missing = catalog.filter((item) => !byId.has(item.id));
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} catalog items have no vector (first: ${missing[0].id}). Run index:embed.`,
    );
  }
  const avgLength = averageLength(catalog);
  return catalog.map((item) => ({
    id: item.id,
    vector: {
      [IMAGE_VECTOR]: Array.from(byId.get(item.id)!),
      [KEYWORD_VECTOR]: documentKeywords(item, avgLength),
    },
    payload: item,
  }));
}

export async function createCollection(
  client: QdrantClient,
  name: string,
  dimensions: number,
): Promise<void> {
  await client.createCollection(name, {
    vectors: { [IMAGE_VECTOR]: { size: dimensions, distance: "Cosine" } },
    // Qdrant computes IDF over the collection, completing BM25 at query time.
    sparse_vectors: { [KEYWORD_VECTOR]: { modifier: "idf" } },
  });
  for (const field of FILTER_FIELDS) {
    await client.createPayloadIndex(name, {
      field_name: field,
      field_schema: "keyword",
      wait: true,
    });
  }
}

export async function upsertPoints(
  client: QdrantClient,
  name: string,
  points: Point[],
  {
    batchSize = 256,
    onProgress,
  }: { batchSize?: number; onProgress?: (done: number) => void } = {},
): Promise<void> {
  for (let start = 0; start < points.length; start += batchSize) {
    await client.upsert(name, {
      wait: true,
      points: points.slice(start, start + batchSize),
    });
    onProgress?.(Math.min(start + batchSize, points.length));
  }
}

/** The collection an alias points to, or null if the alias does not exist. */
export async function aliasTarget(
  client: QdrantClient,
  alias: string,
): Promise<string | null> {
  const { aliases } = await client.getAliases();
  return (
    aliases.find((entry) => entry.alias_name === alias)?.collection_name ?? null
  );
}

/** Atomically points `alias` at `collection`. Returns the previous target. */
export async function swapAlias(
  client: QdrantClient,
  alias: string,
  collection: string,
): Promise<string | null> {
  const previous = await aliasTarget(client, alias);
  await client.updateCollectionAliases({
    actions: [
      ...(previous ? [{ delete_alias: { alias_name: alias } }] : []),
      { create_alias: { alias_name: alias, collection_name: collection } },
    ],
  });
  return previous;
}

/** Deletes versioned collections of `alias` except the ones in `keep`. Returns what was deleted. */
export async function pruneVersions(
  client: QdrantClient,
  alias: string,
  keep: string[],
): Promise<string[]> {
  const { collections } = await client.getCollections();
  const stale = collections
    .map((collection) => collection.name)
    .filter((name) => versionOf(name, alias) !== null && !keep.includes(name));
  for (const name of stale) await client.deleteCollection(name);
  return stale;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
