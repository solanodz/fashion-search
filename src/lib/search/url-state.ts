import {
  MAX_MARKED,
  type SearchFeedback,
  type SearchFilters,
} from "./schema.ts";

/**
 * The shareable part of a search, kept in the page URL:
 * `?q=red+dress&gender=Women&category=Apparel&type=Dresses&colour=Red&like=15970`.
 * An uploaded photo can't be shared; a catalog product's photo ("More like
 * this") is referenced by its id. Results marked to refine the search are
 * `up` (liked) and `down` (disliked) product ids: `&up=25908&down=52406`.
 */
export type SearchState = {
  q: string;
  filters: SearchFilters;
  like: number | null;
  feedback: SearchFeedback;
};

/** URL parameter for each filter field, short and readable. */
const PARAMS = {
  gender: "gender",
  masterCategory: "category",
  subCategory: "subcategory",
  articleType: "type",
  baseColour: "colour",
} as const satisfies Record<keyof SearchFilters, string>;

const MAX_LENGTH = 200;

function clean(value: string | null): string | undefined {
  const trimmed = value?.trim().slice(0, MAX_LENGTH);
  return trimmed ? trimmed : undefined;
}

/** Valid product ids among a parameter's values, without repeats. */
function productIds(values: string[]): number[] {
  const ids = values
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  return [...new Set(ids)].slice(0, MAX_MARKED);
}

export function parseSearchState(params: URLSearchParams): SearchState {
  const filters: SearchFilters = {};
  for (const [field, param] of Object.entries(PARAMS)) {
    const value = clean(params.get(param));
    if (value) filters[field as keyof SearchFilters] = value;
  }
  const like = Number(params.get("like"));
  return {
    q: clean(params.get("q")) ?? "",
    filters,
    like: Number.isSafeInteger(like) && like > 0 ? like : null,
    feedback: {
      like: productIds(params.getAll("up")),
      dislike: productIds(params.getAll("down")),
    },
  };
}

export function serializeSearchState(state: SearchState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.like !== null) params.set("like", String(state.like));
  for (const [field, param] of Object.entries(PARAMS)) {
    const value = state.filters[field as keyof SearchFilters];
    if (value) params.set(param, value);
  }
  for (const id of state.feedback.like) params.append("up", String(id));
  for (const id of state.feedback.dislike) params.append("down", String(id));
  const query = params.toString();
  return query ? `?${query}` : "";
}
