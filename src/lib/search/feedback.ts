import type { CatalogItem } from "../indexing/catalog.ts";

/**
 * Relevance feedback (ADR 0016): the shopper marks results as "more like
 * this" or "less like this" and the search is refined. The vectors move the
 * query towards the liked products' look (in Qdrant, query.ts); this module
 * reads what the marked products have in common in the catalog's own fields
 * and reorders the results by it. Model-free.
 */

/** Catalog fields a like or a dislike can say something about. */
export const FEEDBACK_FIELDS = [
  "articleType",
  "baseColour",
  "gender",
  "usage",
] as const;
export type FeedbackField = (typeof FEEDBACK_FIELDS)[number];

/** What the marked products say the shopper wants, field by field. */
export type Leaning = {
  /** The value every liked product shares. */
  prefer: Partial<Record<FeedbackField, string>>;
  /** Values only disliked products have, where a liked one differs. */
  avoid: Partial<Record<FeedbackField, string[]>>;
};

/**
 * Reads the leaning out of the marked products. A field is preferred when
 * every liked product has the same value for it. A disliked product's value
 * is avoided only when a liked product has another one: without that
 * contrast, a dislike doesn't say which of its fields was wrong.
 */
export function leaning(
  liked: CatalogItem[],
  disliked: CatalogItem[],
): Leaning {
  const prefer: Leaning["prefer"] = {};
  const avoid: Leaning["avoid"] = {};
  if (liked.length === 0) return { prefer, avoid };
  for (const field of FEEDBACK_FIELDS) {
    const likedValues = new Set(liked.map((item) => item[field]));
    const [only] = likedValues;
    if (likedValues.size === 1 && only) prefer[field] = only;
    const unwanted = [
      ...new Set(
        disliked
          .map((item) => item[field])
          .filter(
            (value): value is string => !!value && !likedValues.has(value),
          ),
      ),
    ];
    if (unwanted.length > 0) avoid[field] = unwanted;
  }
  return { prefer, avoid };
}

/** One point per preferred value a product has, minus one per avoided value. */
export function preference(product: CatalogItem, { prefer, avoid }: Leaning) {
  let score = 0;
  for (const field of FEEDBACK_FIELDS) {
    const value = product[field];
    if (!value) continue;
    if (prefer[field] === value) score++;
    if (avoid[field]?.includes(value)) score--;
  }
  return score;
}

/** Results that fit the leaning best first; ties keep their order. */
export function rerank<T extends { product: CatalogItem }>(
  results: T[],
  towards: Leaning,
): T[] {
  return results
    .map((result, rank) => ({
      result,
      rank,
      fit: preference(result.product, towards),
    }))
    .sort((a, b) => b.fit - a.fit || a.rank - b.rank)
    .map(({ result }) => result);
}

/** True when the leaning says anything at all. */
export function hasLeaning({ prefer, avoid }: Leaning): boolean {
  return Object.keys(prefer).length > 0 || Object.keys(avoid).length > 0;
}
