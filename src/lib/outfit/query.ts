import type { SearchFilters } from "../search/schema.ts";
import type { Reading } from "./attributes.ts";
import type { OutfitDescription } from "./describe.ts";
import { GARMENTS } from "./garments.ts";

/**
 * What each garment of an outfit is searched with (ADR 0013): its crop's
 * image vector (when the segmentation found it) plus a text, from the
 * language model's description when there is one, else from CLIP's reading.
 * A type is filtered on when it is trustworthy.
 */

/** Below this, CLIP's guess at the article type is not used as a filter. */
export const MIN_TYPE_CONFIDENCE = 0.5;

export type GarmentQuery = {
  key: string;
  /** Index in the found garments, or null when only the description has it. */
  found: number | null;
  text: string;
  source: "description" | "clip";
  filters: SearchFilters;
};

export function planQueries(
  found: { key: string; reading: Reading }[],
  description: OutfitDescription | null,
  gender: "Any" | "Women" | "Men",
): GarmentQuery[] {
  // With no gender chosen, the description's guess narrows the search.
  const shopFor =
    gender === "Any" && description && description.gender !== "Unisex"
      ? description.gender
      : gender;
  const queries: GarmentQuery[] = [];
  for (const garment of GARMENTS) {
    const index = found.findIndex((f) => f.key === garment.key);
    const described = description?.garments.find((g) => g.slot === garment.key);
    if (index === -1 && !described) continue;
    const reading = index === -1 ? null : found[index].reading;
    const articleType =
      described?.articleType ??
      (reading?.type && reading.typeConfidence >= MIN_TYPE_CONFIDENCE
        ? reading.type
        : undefined);
    queries.push({
      key: garment.key,
      found: index === -1 ? null : index,
      text: described?.description ?? reading!.text,
      source: described ? "description" : "clip",
      filters: {
        ...garment.filters,
        ...(articleType ? { articleType } : {}),
        ...(shopFor === "Any" ? {} : { gender: shopFor }),
      },
    });
  }
  return queries;
}

/** Weight of the text vector against the crop's (as in ADR 0007). */
export const DESCRIPTION_WEIGHT = 2;

/** The crop's vector pulled towards the text's, renormalized. */
export function blend(
  image: ArrayLike<number> | null,
  text: ArrayLike<number>,
  weight = DESCRIPTION_WEIGHT,
): Float32Array {
  const out = Float32Array.from(
    text,
    (value, i) => (image ? image[i] : 0) + weight * value,
  );
  const norm = Math.hypot(...out) || 1;
  return out.map((value) => value / norm);
}
