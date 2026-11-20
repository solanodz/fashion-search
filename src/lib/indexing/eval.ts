import type { CatalogItem } from "./catalog.ts";

/**
 * Offline retrieval evaluation: for each text query we know which attribute
 * values a relevant product has, and measure precision@k per attribute.
 */

export const EVAL_ATTRIBUTES = ["articleType", "baseColour", "gender"] as const;
export type EvalAttribute = (typeof EVAL_ATTRIBUTES)[number];

export type EvalQuery = {
  query: string;
  /** The same query in Spanish (Rioplatense), for the multilingual encoder. */
  es: string;
  /** Accepted values per attribute; omitted attributes are not checked. */
  expect: Partial<Record<EvalAttribute, string[]>>;
};

/** Precision@k per checked attribute, plus "all" (every checked attribute matches). */
export type QueryScore = Partial<Record<EvalAttribute | "all", number>>;

export function scoreQuery(
  expect: EvalQuery["expect"],
  results: CatalogItem[],
  k: number,
): QueryScore {
  if (results.length === 0) throw new Error("No results to score");
  const top = results.slice(0, k);
  const checked = EVAL_ATTRIBUTES.filter((attribute) => expect[attribute]);
  const matches = (item: CatalogItem, attribute: EvalAttribute) =>
    expect[attribute]!.includes(item[attribute] ?? "");

  const score: QueryScore = {};
  for (const attribute of checked) {
    score[attribute] =
      top.filter((item) => matches(item, attribute)).length / k;
  }
  score.all =
    top.filter((item) => checked.every((attribute) => matches(item, attribute)))
      .length / k;
  return score;
}

/** Mean of each metric over the queries that check it. */
export function summarize(scores: QueryScore[]): QueryScore {
  const summary: QueryScore = {};
  for (const metric of [...EVAL_ATTRIBUTES, "all"] as const) {
    const values = scores
      .map((score) => score[metric])
      .filter((value): value is number => value !== undefined);
    if (values.length > 0)
      summary[metric] =
        values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return summary;
}
