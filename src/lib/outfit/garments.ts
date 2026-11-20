import type { SearchFilters } from "../search/schema.ts";

/**
 * Turns a clothes segmentation of a photo of a person into one cut-out per
 * garment, ready to be searched against the catalog (ADR 0013). Model-free:
 * the segmentation runs in the outfit worker.
 */

/** A garment the outfit search looks for, and where it lives in the catalog. */
export type Garment = {
  key: string;
  name: string;
  /** Labels of the segmentation model (segformer_b2_clothes) that make it up. */
  labels: string[];
  filters: SearchFilters;
  /**
   * Search only the biggest of its parts: one shoe framed alone looks like a
   * catalog photo, two far apart make a mostly empty cut-out.
   */
  largestPart?: boolean;
};

/** In the order they are shown, top to bottom of a person. */
export const GARMENTS: Garment[] = [
  {
    key: "hat",
    name: "Hat",
    labels: ["Hat"],
    filters: { subCategory: "Headwear" },
  },
  {
    key: "sunglasses",
    name: "Sunglasses",
    labels: ["Sunglasses"],
    filters: { subCategory: "Eyewear" },
  },
  {
    key: "scarf",
    name: "Scarf",
    labels: ["Scarf"],
    filters: { subCategory: "Scarves" },
  },
  {
    key: "top",
    name: "Top",
    labels: ["Upper-clothes"],
    filters: { subCategory: "Topwear" },
  },
  {
    key: "dress",
    name: "Dress",
    labels: ["Dress"],
    filters: { subCategory: "Dress" },
  },
  {
    key: "bottom",
    name: "Bottom",
    labels: ["Pants", "Skirt"],
    filters: { subCategory: "Bottomwear" },
  },
  {
    key: "belt",
    name: "Belt",
    labels: ["Belt"],
    filters: { subCategory: "Belts" },
  },
  {
    key: "bag",
    name: "Bag",
    labels: ["Bag"],
    filters: { subCategory: "Bags" },
  },
  {
    key: "shoes",
    name: "Shoes",
    labels: ["Left-shoe", "Right-shoe"],
    filters: { masterCategory: "Footwear" },
    largestPart: true,
  },
];

/**
 * Smallest share of the photo a garment must cover to be searched; below it
 * the cut-out is a few stray pixels. Small items (sunglasses, belts) get a
 * lower bar than clothes.
 */
export const MIN_SHARE: Record<string, number> = {
  sunglasses: 0.002,
  belt: 0.004,
  default: 0.006,
};

export type Box = { x0: number; y0: number; x1: number; y1: number };

export type Region = {
  garment: Garment;
  /** 1 where the garment is, 0 elsewhere; one byte per pixel. */
  mask: Uint8Array;
  box: Box;
  /** Share of the photo's pixels. */
  share: number;
};

/** Per-label masks as the segmentation pipeline returns them (0 or 255 per pixel). */
export type LabelMask = { label: string; mask: ArrayLike<number> };

/** Garments found in a segmentation, in GARMENTS order. */
export function garmentRegions(
  segments: LabelMask[],
  width: number,
  height: number,
): Region[] {
  const regions: Region[] = [];
  for (const garment of GARMENTS) {
    let parts = segments.filter((s) => garment.labels.includes(s.label));
    if (parts.length === 0) continue;
    if (garment.largestPart) {
      const size = (part: LabelMask) => {
        let n = 0;
        for (let i = 0; i < part.mask.length; i++) if (part.mask[i] > 0) n++;
        return n;
      };
      parts = [parts.reduce((a, b) => (size(b) > size(a) ? b : a))];
    }
    const mask = new Uint8Array(width * height);
    let count = 0;
    const box = { x0: width, y0: height, x1: 0, y1: 0 };
    for (let i = 0; i < mask.length; i++) {
      if (!parts.some((part) => part.mask[i] > 0)) continue;
      mask[i] = 1;
      count++;
      const x = i % width;
      const y = (i - x) / width;
      if (x < box.x0) box.x0 = x;
      if (y < box.y0) box.y0 = y;
      if (x + 1 > box.x1) box.x1 = x + 1;
      if (y + 1 > box.y1) box.y1 = y + 1;
    }
    const share = count / mask.length;
    if (share < (MIN_SHARE[garment.key] ?? MIN_SHARE.default)) continue;
    regions.push({ garment, mask, box, share });
  }
  return resolveDress(regions);
}

/**
 * A dress and a top or bottom are two readings of the same clothes; the
 * model often marks a few dress pixels on a top and trousers, or the other
 * way round. Keeps whichever reading covers more of the photo.
 */
function resolveDress(regions: Region[]): Region[] {
  const share = (key: string) =>
    regions.find((r) => r.garment.key === key)?.share ?? 0;
  const separates = share("top") + share("bottom");
  if (share("dress") === 0 || separates === 0) return regions;
  const drop = share("dress") > separates ? ["top", "bottom"] : ["dress"];
  return regions.filter((r) => !drop.includes(r.garment.key));
}

/** Catalog photos are 3:4 (384 × 512). */
export const CUTOUT_ASPECT = 3 / 4;

/**
 * The box grown by a margin and widened or heightened to the catalog's 3:4
 * aspect, centred on the garment. It may extend past the photo's edges.
 */
export function cutoutFrame(box: Box, margin = 0.08): Box {
  let w = box.x1 - box.x0;
  let h = box.y1 - box.y0;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  w *= 1 + 2 * margin;
  h *= 1 + 2 * margin;
  if (w / h > CUTOUT_ASPECT) h = w / CUTOUT_ASPECT;
  else w = h * CUTOUT_ASPECT;
  return {
    x0: Math.round(cx - w / 2),
    y0: Math.round(cy - h / 2),
    x1: Math.round(cx + w / 2),
    y1: Math.round(cy + h / 2),
  };
}

/**
 * The garment framed like a catalog photo (3:4, centred), as RGB pixel data.
 * Areas past the photo's edges are white. With `isolate`, every pixel outside
 * the garment's mask (the person, the background, other garments) is white
 * too, as on the catalog's product shots. Searching works better without it:
 * most catalog clothes are photographed on a person (ADR 0013).
 */
export function cutOut(
  data: ArrayLike<number>,
  width: number,
  height: number,
  channels: number,
  region: Region,
  { isolate = false }: { isolate?: boolean } = {},
): { data: Uint8ClampedArray; width: number; height: number } {
  const frame = cutoutFrame(region.box);
  const w = frame.x1 - frame.x0;
  const h = frame.y1 - frame.y0;
  const out = new Uint8ClampedArray(w * h * 3).fill(255);
  for (let y = Math.max(0, frame.y0); y < Math.min(height, frame.y1); y++) {
    for (let x = Math.max(0, frame.x0); x < Math.min(width, frame.x1); x++) {
      const i = y * width + x;
      if (isolate && !region.mask[i]) continue;
      const o = ((y - frame.y0) * w + (x - frame.x0)) * 3;
      for (let k = 0; k < 3; k++) {
        // Greyscale sources repeat their single channel.
        out[o + k] = data[i * channels + Math.min(k, channels - 1)];
      }
    }
  }
  return { data: out, width: w, height: h };
}
