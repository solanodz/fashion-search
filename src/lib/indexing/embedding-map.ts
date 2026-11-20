/**
 * The 3D map of the embedding space (ADR 0010): every product's CLIP image
 * vector projected to three dimensions with UMAP, quantized to 16 bits per
 * axis, plus its article type. Written by `npm run index:map` and read by
 * the browser.
 *
 * Binary layout, little-endian:
 *   u32 count | u32 ids[count] | u16 xyz[3 × count] | u16 types[count]
 * Types index into `types` in the JSON metadata next to it.
 */

/** Muted hue per master category; the map stays quiet next to the photos. */
export const CATEGORY_COLOURS: Record<string, string> = {
  Apparel: "#7f8fb5",
  Accessories: "#c3a35e",
  Footwear: "#7ea58b",
  "Personal Care": "#c58c9d",
};
export const OTHER_COLOUR = "#a1a19b";

export const MAP_FILES = {
  points: "embedding-map.bin",
  meta: "embedding-map.json",
} as const;

/** Axes per point. */
export const MAP_DIMENSIONS = 3;

export type MapMeta = {
  model: string;
  dtype: string;
  count: number;
  dimensions: number;
  /** Article types, indexed by the binary `types` array. */
  types: string[];
  /** Master category of each article type, for colouring. */
  categories: Record<string, string>;
};

export type EmbeddingMap = {
  ids: Uint32Array;
  /** Interleaved x, y, z in [0, 1]. */
  xyz: Float32Array;
  types: Uint16Array;
  meta: MapMeta;
};

export type Position = { x: number; y: number; z: number };

const MAX = 0xffff;
const BYTES_PER_POINT = 4 + MAP_DIMENSIONS * 2 + 2;

function quantile(sorted: number[], q: number): number {
  return sorted[Math.round((sorted.length - 1) * q)];
}

/**
 * Scales points into the unit cube, keeping proportions and centring them.
 * The range is taken between the `clip` and 1 − `clip` quantiles of each
 * axis, so a few stray products don't shrink the clusters; points outside
 * are clamped when encoded.
 */
export function normalizePoints(
  points: number[][],
  clip = 0.005,
): Float32Array {
  const dims = points[0]?.length ?? MAP_DIMENSIONS;
  const ranges = Array.from({ length: dims }, (_, axis) => {
    const sorted = points.map((p) => p[axis]).sort((a, b) => a - b);
    return { min: quantile(sorted, clip), max: quantile(sorted, 1 - clip) };
  });
  const span = Math.max(...ranges.map((r) => r.max - r.min)) || 1;
  const out = new Float32Array(points.length * dims);
  points.forEach((point, i) => {
    for (let axis = 0; axis < dims; axis++) {
      const { min, max } = ranges[axis];
      const offset = (1 - (max - min) / span) / 2;
      out[i * dims + axis] = offset + (point[axis] - min) / span;
    }
  });
  return out;
}

export function encodeMap(
  ids: ArrayLike<number>,
  xyz: Float32Array,
  types: ArrayLike<number>,
): Uint8Array {
  const count = ids.length;
  const buffer = new ArrayBuffer(4 + count * BYTES_PER_POINT);
  const view = new DataView(buffer);
  view.setUint32(0, count, true);
  let offset = 4;
  for (let i = 0; i < count; i++, offset += 4)
    view.setUint32(offset, ids[i], true);
  for (let i = 0; i < count * MAP_DIMENSIONS; i++, offset += 2)
    view.setUint16(
      offset,
      Math.round(Math.min(1, Math.max(0, xyz[i])) * MAX),
      true,
    );
  for (let i = 0; i < count; i++, offset += 2)
    view.setUint16(offset, types[i], true);
  return new Uint8Array(buffer);
}

export function decodeMap(bytes: ArrayBuffer, meta: MapMeta): EmbeddingMap {
  const view = new DataView(bytes);
  const count = view.getUint32(0, true);
  const expected = 4 + count * BYTES_PER_POINT;
  if (
    bytes.byteLength !== expected ||
    count !== meta.count ||
    meta.dimensions !== MAP_DIMENSIONS
  ) {
    throw new Error(
      `Embedding map is ${bytes.byteLength} bytes for ${count} points in ${meta.dimensions}D; expected ${expected} bytes and ${meta.count} points in ${MAP_DIMENSIONS}D`,
    );
  }
  const ids = new Uint32Array(count);
  const xyz = new Float32Array(count * MAP_DIMENSIONS);
  const types = new Uint16Array(count);
  let offset = 4;
  for (let i = 0; i < count; i++, offset += 4)
    ids[i] = view.getUint32(offset, true);
  for (let i = 0; i < count * MAP_DIMENSIONS; i++, offset += 2)
    xyz[i] = view.getUint16(offset, true) / MAX;
  for (let i = 0; i < count; i++, offset += 2)
    types[i] = view.getUint16(offset, true);
  return { ids, xyz, types, meta };
}

/**
 * Where a query lands in the space: the similarity-weighted average of its
 * top results' positions. UMAP can't place new points without the model,
 * and the nearest products are where the query "is" anyway.
 */
export function placeQuery(
  positions: (Position & { score: number })[],
  top = 10,
): Position | null {
  const used = positions.slice(0, top);
  if (used.length === 0) return null;
  const min = Math.min(...used.map((p) => p.score));
  // Weights relative to the weakest, so the closest products pull harder.
  const weights = used.map((p) => p.score - min + 1e-3);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const average = (axis: "x" | "y" | "z") =>
    used.reduce((sum, p, i) => sum + p[axis] * weights[i], 0) / total;
  return { x: average("x"), y: average("y"), z: average("z") };
}
