/**
 * The 2D map of the embedding space (ADR 0010): every product's CLIP image
 * vector projected with UMAP, quantized to 16 bits per axis, plus its
 * article type. Written by `npm run index:map` and read by the browser.
 *
 * Binary layout, little-endian:
 *   u32 count | u32 ids[count] | u16 xy[2 × count] | u16 types[count]
 * Types index into `types` in the JSON metadata next to it.
 */

export const MAP_FILES = {
  points: "embedding-map.bin",
  meta: "embedding-map.json",
} as const;

export type MapMeta = {
  model: string;
  dtype: string;
  count: number;
  /** Article types, indexed by the binary `types` array. */
  types: string[];
  /** Master category of each article type, for colouring. */
  categories: Record<string, string>;
};

export type EmbeddingMap = {
  ids: Uint32Array;
  /** Interleaved x, y in [0, 1]. */
  xy: Float32Array;
  types: Uint16Array;
  meta: MapMeta;
};

const MAX = 0xffff;

function quantile(sorted: number[], q: number): number {
  return sorted[Math.round((sorted.length - 1) * q)];
}

/**
 * Scales points to [0, 1] on both axes, keeping the aspect ratio. The range
 * is taken between the `clip` and 1 − `clip` quantiles, so a few stray
 * products don't shrink the clusters; points outside are clamped later.
 */
export function normalizePoints(
  points: number[][],
  clip = 0.005,
): Float32Array {
  const xs = points.map(([x]) => x).sort((a, b) => a - b);
  const ys = points.map(([, y]) => y).sort((a, b) => a - b);
  const minX = quantile(xs, clip);
  const maxX = quantile(xs, 1 - clip);
  const minY = quantile(ys, clip);
  const maxY = quantile(ys, 1 - clip);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const offsetX = (1 - (maxX - minX) / span) / 2;
  const offsetY = (1 - (maxY - minY) / span) / 2;
  const xy = new Float32Array(points.length * 2);
  points.forEach(([x, y], i) => {
    xy[i * 2] = offsetX + (x - minX) / span;
    xy[i * 2 + 1] = offsetY + (y - minY) / span;
  });
  return xy;
}

export function encodeMap(
  ids: ArrayLike<number>,
  xy: Float32Array,
  types: ArrayLike<number>,
): Uint8Array {
  const count = ids.length;
  const buffer = new ArrayBuffer(4 + count * 4 + count * 4 + count * 2);
  const view = new DataView(buffer);
  view.setUint32(0, count, true);
  let offset = 4;
  for (let i = 0; i < count; i++, offset += 4)
    view.setUint32(offset, ids[i], true);
  for (let i = 0; i < count * 2; i++, offset += 2)
    view.setUint16(
      offset,
      Math.round(Math.min(1, Math.max(0, xy[i])) * MAX),
      true,
    );
  for (let i = 0; i < count; i++, offset += 2)
    view.setUint16(offset, types[i], true);
  return new Uint8Array(buffer);
}

export function decodeMap(bytes: ArrayBuffer, meta: MapMeta): EmbeddingMap {
  const view = new DataView(bytes);
  const count = view.getUint32(0, true);
  const expected = 4 + count * 10;
  if (bytes.byteLength !== expected || count !== meta.count) {
    throw new Error(
      `Embedding map is ${bytes.byteLength} bytes for ${count} points; expected ${expected} bytes and ${meta.count} points`,
    );
  }
  const ids = new Uint32Array(count);
  const xy = new Float32Array(count * 2);
  const types = new Uint16Array(count);
  let offset = 4;
  for (let i = 0; i < count; i++, offset += 4)
    ids[i] = view.getUint32(offset, true);
  for (let i = 0; i < count * 2; i++, offset += 2)
    xy[i] = view.getUint16(offset, true) / MAX;
  for (let i = 0; i < count; i++, offset += 2)
    types[i] = view.getUint16(offset, true);
  return { ids, xy, types, meta };
}

/**
 * Where a query lands on the map: the similarity-weighted average of its top
 * results' positions. UMAP can't place new points without the model, and the
 * nearest products are where the query "is" anyway.
 */
export function placeQuery(
  positions: { x: number; y: number; score: number }[],
  top = 10,
): { x: number; y: number } | null {
  const used = positions.slice(0, top);
  if (used.length === 0) return null;
  const min = Math.min(...used.map((p) => p.score));
  // Weights relative to the weakest, so the closest products pull harder.
  const weights = used.map((p) => p.score - min + 1e-3);
  const total = weights.reduce((sum, w) => sum + w, 0);
  return {
    x: used.reduce((sum, p, i) => sum + p.x * weights[i], 0) / total,
    y: used.reduce((sum, p, i) => sum + p.y * weights[i], 0) / total,
  };
}
