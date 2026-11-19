import type { CatalogItem } from "../indexing/catalog.ts";

/**
 * Keyword (sparse) vectors for hybrid search, in the BM25 style (ADR 0009).
 * Shared by the indexer (documents) and the browser (queries), so the query
 * text never has to reach the server: only token hashes do.
 *
 * Qdrant applies the IDF part itself (`modifier: "idf"` on the sparse
 * vector), so documents carry BM25's saturated term frequency and queries
 * carry 1 per distinct token.
 */

export type SparseVector = { indices: number[]; values: number[] };

export const BM25 = { k1: 1.2, b: 0.75 } as const;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "for",
  "with",
  "of",
  "in",
  "on",
  "to",
  "by",
  "set",
  "pack",
]);

/** Light stemming so plurals match: shoes→shoe, dresses→dress, jeans→jean. */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith("sses")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss"))
    return token.slice(0, -1);
  return token;
}

/** Lower-cased, stemmed word tokens without stopwords or single letters. */
export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/['’]s\b/g, "")
      // "T-shirt", "T shirt" and "Tshirt" are the same garment, not a shirt.
      .replace(/\bt[\s-]?shirt/g, "tshirt")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 1 && !STOPWORDS.has(token))
      .map(stem)
  );
}

/** 32-bit FNV-1a hash of a token, used as its sparse vector index. */
export function hashToken(token: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The text a product is matched on: its name plus its type, colour and gender. */
export function productText(item: CatalogItem): string {
  return [item.name, item.articleType, item.baseColour, item.gender]
    .filter(Boolean)
    .join(" ");
}

function counts(tokens: string[]): Map<number, number> {
  const byIndex = new Map<number, number>();
  for (const token of tokens) {
    const index = hashToken(token);
    byIndex.set(index, (byIndex.get(index) ?? 0) + 1);
  }
  return byIndex;
}

function toSparse(byIndex: Map<number, number>): SparseVector {
  const entries = [...byIndex].sort(([a], [b]) => a - b);
  return {
    indices: entries.map(([index]) => index),
    values: entries.map(([, value]) => value),
  };
}

/** Average token count of the catalog's product texts (BM25's avgdl). */
export function averageLength(items: CatalogItem[]): number {
  if (items.length === 0) return 1;
  const total = items.reduce(
    (sum, item) => sum + tokenize(productText(item)).length,
    0,
  );
  return total / items.length || 1;
}

/** A product's keyword vector: BM25 term-frequency weights. */
export function documentKeywords(
  item: CatalogItem,
  avgLength: number,
): SparseVector {
  const tokens = tokenize(productText(item));
  const norm = BM25.k1 * (1 - BM25.b + (BM25.b * tokens.length) / avgLength);
  const byIndex = counts(tokens);
  for (const [index, tf] of byIndex) {
    byIndex.set(index, (tf * (BM25.k1 + 1)) / (tf + norm));
  }
  return toSparse(byIndex);
}

/** A query's keyword vector, or null when it has no usable tokens. */
export function queryKeywords(text: string): SparseVector | null {
  const byIndex = counts(tokenize(text));
  for (const index of byIndex.keys()) byIndex.set(index, 1);
  return byIndex.size > 0 ? toSparse(byIndex) : null;
}
