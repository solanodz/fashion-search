import type { CatalogItem } from "../indexing/catalog.ts";

/**
 * Suggests a new product's catalog fields from its photo (ADR 0015): the
 * photo's nearest products in the catalog vote on each field. No model is
 * trained; the catalog's own labels are the knowledge. Model-free; the
 * neighbours come from a vector search.
 */

/** Catalog fields that can be suggested, in display order. */
export const TAG_FIELDS = [
  "masterCategory",
  "subCategory",
  "articleType",
  "baseColour",
  "gender",
  "usage",
  "season",
] as const;
export type TagField = (typeof TAG_FIELDS)[number];

/** A nearby catalog product: its similarity to the photo and its labels. */
export type Neighbour = {
  score: number;
  product: Partial<Pick<CatalogItem, TagField>>;
  /** How alike its colours and the photo's are, 0 to 1 (colour.ts). */
  colourSimilarity?: number;
};

export type Suggestion = {
  value: string;
  /** The value's share of the vote, 0 to 1. */
  confidence: number;
  /** Other values that got votes, most voted first. */
  alternatives: { value: string; share: number }[];
};

export type Suggestions = Record<TagField, Suggestion | null>;

/** How many neighbours vote. Chosen on the evaluation (ADR 0015). */
export const VOTERS = 10;

/**
 * How fast a vote fades with distance from the closest neighbour: a
 * neighbour this much less similar counts e times less. Null: equal votes.
 */
export const VOTE_TEMPERATURE: number | null = 0.02;

/**
 * The colour is voted by more neighbours, weighted by how alike their
 * colours and the photo's are instead of by CLIP similarity: CLIP's vectors
 * weigh shape over colour (51% right; this way 62%, ADR 0015).
 */
export const COLOUR_VOTERS = 30;
export const COLOUR_TEMPERATURE = 0.1;

/** At or above this share, a suggestion can be filled in without review. */
export const CONFIDENT = 0.8;

type Vote = { value: string | null | undefined; weight: number };

function tally(votes: Vote[]): Suggestion | null {
  const totals = new Map<string, number>();
  let total = 0;
  for (const { value, weight } of votes) {
    // Products without a value for the field don't vote on it.
    if (!value) continue;
    totals.set(value, (totals.get(value) ?? 0) + weight);
    total += weight;
  }
  const [winner, ...alternatives] = [...totals]
    .map(([value, weight]) => ({ value, share: weight / total }))
    .sort((a, b) => b.share - a.share);
  return winner
    ? { value: winner.value, confidence: winner.share, alternatives }
    : null;
}

/** Weights that fade with distance from the best value. */
function fading(values: number[], temperature: number | null): number[] {
  const top = Math.max(...values);
  return values.map((value) =>
    temperature ? Math.exp((value - top) / temperature) : 1,
  );
}

export function suggestTags(
  neighbours: Neighbour[],
  {
    voters = VOTERS,
    temperature = VOTE_TEMPERATURE,
    colourVoters = COLOUR_VOTERS,
    colourTemperature = COLOUR_TEMPERATURE,
  }: {
    voters?: number;
    temperature?: number | null;
    colourVoters?: number;
    colourTemperature?: number | null;
  } = {},
): Suggestions {
  const sorted = [...neighbours].sort((a, b) => b.score - a.score);
  const closest = sorted.slice(0, voters);
  const weights = fading(
    closest.map((n) => n.score),
    temperature,
  );
  // With colour similarities, the colour gets its own, wider vote.
  const byColour = sorted.slice(0, colourVoters);
  const colourWeights = byColour.every((n) => n.colourSimilarity !== undefined)
    ? fading(
        byColour.map((n) => n.colourSimilarity!),
        colourTemperature,
      )
    : null;
  return Object.fromEntries(
    TAG_FIELDS.map((field) => [
      field,
      field === "baseColour" && colourWeights && byColour.length > 0
        ? tally(
            byColour.map(({ product }, index) => ({
              value: product.baseColour,
              weight: colourWeights[index],
            })),
          )
        : tally(
            closest.map(({ product }, index) => ({
              value: product[field],
              weight: weights[index],
            })),
          ),
    ]),
  ) as Suggestions;
}
