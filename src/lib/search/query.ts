import type { QdrantClient } from "@qdrant/js-client-rest";

import type { CatalogItem } from "../indexing/catalog.ts";
import {
  hasLeaning,
  type Leaning,
  leaning as readLeaning,
  rerank,
} from "./feedback.ts";
import type { SparseVector } from "./keywords.ts";
import type {
  QueryPart,
  SearchExclude,
  SearchFeedback,
  SearchFilters,
  SearchResult,
  Signal,
} from "./schema.ts";

/**
 * Hybrid product search (ADR 0009), shared by the API route and the
 * evaluation script. The CLIP query vector searches the image vectors; when
 * the query has text, its keyword vector also searches the keyword vectors,
 * and both result lists are merged by reciprocal rank fusion. Every result
 * still reports its cosine similarity to the CLIP query vector.
 */

/** Named vectors of each point. */
export const IMAGE_VECTOR = "image";
export const KEYWORD_VECTOR = "keywords";

/** RRF constant from the original paper; damps the weight of top ranks. */
export const RRF_K = 60;

/** Candidates each list brings when feedback reorders them (ADR 0016). */
export const FEEDBACK_CANDIDATES = 100;

/**
 * Qdrant filter matching every given field exactly and, when values or
 * products are excluded, none of them.
 */
export function toQdrantFilter(
  filters: SearchFilters,
  exclude: SearchExclude = {},
  withoutIds: number[] = [],
) {
  const must = Object.entries(filters)
    .filter(([, value]) => value)
    .map(([key, value]) => ({ key, match: { value: value as string } }));
  const must_not = [
    ...Object.entries(exclude)
      .filter(([, values]) => values && values.length > 0)
      .map(([key, values]) => ({ key, match: { any: values as string[] } })),
    ...(withoutIds.length > 0 ? [{ has_id: withoutIds }] : []),
  ];
  if (must.length === 0 && must_not.length === 0) return undefined;
  return {
    ...(must.length > 0 ? { must } : {}),
    ...(must_not.length > 0 ? { must_not } : {}),
  };
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

/**
 * Reciprocal rank fusion: each list adds 1 / (k + rank) to an item's score.
 * Returns ids by fused score, with the lists each one appeared in. Ties keep
 * the order of the first list.
 */
export function fuseRanks<S extends string>(
  lists: { signal: S; ids: number[] }[],
  k = RRF_K,
): { id: number; score: number; signals: S[] }[] {
  const fused = new Map<
    number,
    { id: number; score: number; signals: S[]; first: number }
  >();
  let order = 0;
  for (const { signal, ids } of lists) {
    ids.forEach((id, rank) => {
      const entry = fused.get(id) ?? {
        id,
        score: 0,
        signals: [],
        first: order++,
      };
      entry.score += 1 / (k + rank + 1);
      entry.signals.push(signal);
      fused.set(id, entry);
    });
  }
  return [...fused.values()]
    .sort((a, b) => b.score - a.score || a.first - b.first)
    .map(({ id, score, signals }) => ({ id, score, signals }));
}

export type SearchRequestData = {
  vector: number[];
  filters: SearchFilters;
  /** Values to leave out, per field. */
  exclude?: SearchExclude;
  /** Results the shopper marked: more like these, less like those. */
  feedback?: SearchFeedback;
  /**
   * Which half of the feedback to use; both by default. The evaluation
   * compares them (`npm run index:feedback-eval`).
   */
  feedbackMode?: "vectors" | "fields" | "both";
  limit: number;
  keywords?: SparseVector;
  parts?: { name: QueryPart; vector: number[] }[];
  /** Also return the image and keyword lists before fusion (compare mode). */
  compare?: boolean;
};

/** How many products each unfused list returns in compare mode. */
export const COMPARE_LIMIT = 12;

export type SearchOutput = {
  results: SearchResult[];
  lists?: { image: SearchResult[]; keywords: SearchResult[] };
  /** With feedback: what the marked products say the shopper wants. */
  leaning?: Leaning;
};

type Hit = { id: number; payload: CatalogItem; vector: number[] | null };

export async function runSearch(
  client: QdrantClient,
  collection: string,
  request: SearchRequestData,
): Promise<SearchResult[]> {
  return (await runSearchWithLists(client, collection, request)).results;
}

/** The fused results and, in compare mode, the two lists they came from. */
export async function runSearchWithLists(
  client: QdrantClient,
  collection: string,
  {
    vector,
    filters,
    exclude,
    feedback,
    feedbackMode = "both",
    limit,
    keywords,
    parts,
    compare,
  }: SearchRequestData,
): Promise<SearchOutput> {
  // Relevance feedback (ADR 0016): the marked products leave the results,
  // the liked ones pull the image query towards their look and the disliked
  // ones push it away, and what they share in the catalog's fields reorders
  // the candidates.
  const like = feedback?.like ?? [];
  const dislike = feedback?.dislike ?? [];
  const marked = [...like, ...dislike];
  const refining = marked.length > 0;
  const moveQuery = refining && feedbackMode !== "fields";
  const readFields = refining && feedbackMode !== "vectors";

  const filter = toQdrantFilter(filters, exclude, marked);
  const hybrid = !!keywords && keywords.indices.length > 0;
  const breakdown = !!parts && parts.length > 1;
  // Image vectors are needed to score keyword-only hits and query parts and,
  // with feedback, every result against the query as it was typed.
  const withVector = hybrid || breakdown || refining ? [IMAGE_VECTOR] : false;
  // Each list brings more candidates than shown, so fusion has room to reorder.
  const candidates = refining
    ? FEEDBACK_CANDIDATES
    : hybrid
      ? Math.min(100, limit * 2)
      : limit;

  const searches = [
    {
      query: moveQuery
        ? {
            recommend: {
              positive: [vector, ...like],
              negative: dislike,
              strategy: "average_vector" as const,
            },
          }
        : vector,
      using: IMAGE_VECTOR,
      filter,
      limit: candidates,
      with_payload: true,
      with_vector: withVector,
    },
    ...(hybrid
      ? [
          {
            query: keywords,
            using: KEYWORD_VECTOR,
            filter,
            limit: candidates,
            with_payload: true,
            with_vector: withVector,
          },
        ]
      : []),
  ];
  const [responses, markedPoints] = await Promise.all([
    client.queryBatch(collection, { searches }),
    readFields
      ? client.retrieve(collection, {
          ids: marked,
          with_payload: true,
          with_vector: false,
        })
      : [],
  ]);
  const markedItems = new Map(
    markedPoints.map((point) => [
      Number(point.id),
      point.payload as CatalogItem,
    ]),
  );
  const towards = readFields
    ? readLeaning(
        like.flatMap((id) => markedItems.get(id) ?? []),
        dislike.flatMap((id) => markedItems.get(id) ?? []),
      )
    : undefined;

  const hits = new Map<number, Hit>();
  const lists = responses.map((response, index) => ({
    signal: (index === 0 ? "image" : "keywords") as Signal,
    ids: response.points.map((point) => {
      const id = Number(point.id);
      if (!hits.has(id)) {
        hits.set(id, {
          id,
          payload: point.payload as CatalogItem,
          vector: denseVector(point.vector),
        });
      }
      return id;
    }),
  }));
  // With a moved query, the image list's scores are not similarities to the
  // query as typed, so those are computed from the vectors instead.
  const imageScores = new Map(
    moveQuery
      ? []
      : responses[0].points.map((point) => [Number(point.id), point.score]),
  );

  const fused = fuseRanks(lists).map((entry) => ({
    ...entry,
    product: hits.get(entry.id)!.payload,
  }));
  const ordered =
    towards && hasLeaning(towards) ? rerank(fused, towards) : fused;
  const results = ordered.slice(0, limit).map(({ id, signals }) => {
    const hit = hits.get(id)!;
    const result: SearchResult = {
      id,
      score:
        imageScores.get(id) ?? (hit.vector ? cosine(vector, hit.vector) : 0),
      product: hit.payload,
    };
    if (hybrid) result.signals = signals;
    if (breakdown && hit.vector) {
      result.parts = Object.fromEntries(
        parts.map((part) => [part.name, cosine(part.vector, hit.vector!)]),
      );
    }
    return result;
  });

  const output: SearchOutput = towards
    ? { results, leaning: towards }
    : { results };
  if (!compare || !hybrid || refining) return output;
  // Where each fused result sat in the full candidate lists.
  for (const result of results) {
    result.ranks = {};
    lists.forEach(({ signal, ids }) => {
      const rank = ids.indexOf(result.id);
      if (rank !== -1) result.ranks![signal] = rank + 1;
    });
  }
  // Each list as it was before fusion, every product with its cosine to the
  // query; keyword hits also carry their BM25 score.
  const unfused = (index: number): SearchResult[] =>
    responses[index].points.slice(0, COMPARE_LIMIT).map((point) => {
      const hit = hits.get(Number(point.id))!;
      return {
        id: hit.id,
        score:
          imageScores.get(hit.id) ??
          (hit.vector ? cosine(vector, hit.vector) : 0),
        product: hit.payload,
        ...(index === 1 ? { keywordScore: point.score } : {}),
      };
    });
  return { results, lists: { image: unfused(0), keywords: unfused(1) } };
}
