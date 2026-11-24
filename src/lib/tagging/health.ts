import type { CatalogItem } from "../indexing/catalog.ts";
import { type Neighbour, suggestTags } from "./suggest.ts";

/**
 * Catalog health (ADR 0015): the vote that tags a new product, run over the
 * catalog itself. A product whose neighbours agree on a different type than
 * its label is worth a second look. Model-free.
 */

/** The neighbours' type must get at least this share of the vote. */
export const CONTRADICTION_SHARE = 0.9;

export type Contradiction = {
  /** The type most neighbours have. */
  looksLike: string;
  /** Its share of the vote, 0 to 1. */
  share: number;
};

/** What a product's neighbours say its type is, when they contradict its label. */
export function contradictedType(
  item: Pick<CatalogItem, "articleType">,
  neighbours: Neighbour[],
  minShare = CONTRADICTION_SHARE,
): Contradiction | null {
  const suggestion = suggestTags(neighbours).articleType;
  if (
    !suggestion ||
    suggestion.value === item.articleType ||
    suggestion.confidence < minShare
  ) {
    return null;
  }
  return { looksLike: suggestion.value, share: suggestion.confidence };
}
