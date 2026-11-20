/**
 * Occlusion sensitivity: which parts of a product photo make it match the
 * query. Each cell of a grid is greyed out in turn and the photo re-encoded;
 * the more the similarity to the query drops without a cell, the more that
 * cell mattered. Model-free helpers; the encoding runs in the CLIP worker.
 */

export type Cell = { x0: number; y0: number; x1: number; y1: number };

/** Pixel bounds of each cell of a cols × rows grid, row by row. */
export function gridCells(
  width: number,
  height: number,
  cols: number,
  rows: number,
): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x0: Math.round((c * width) / cols),
        x1: Math.round(((c + 1) * width) / cols),
        y0: Math.round((r * height) / rows),
        y1: Math.round(((r + 1) * height) / rows),
      });
    }
  }
  return cells;
}

/** A copy of interleaved pixel data with one cell filled with neutral grey. */
export function occlude(
  data: ArrayLike<number>,
  width: number,
  channels: number,
  cell: Cell,
  grey = 128,
): Uint8ClampedArray {
  const out = Uint8ClampedArray.from(data);
  for (let y = cell.y0; y < cell.y1; y++) {
    for (let x = cell.x0; x < cell.x1; x++) {
      const base = (y * width + x) * channels;
      // Colour channels only; alpha (a 4th channel) stays.
      for (let k = 0; k < Math.min(channels, 3); k++) out[base + k] = grey;
    }
  }
  return out;
}

/**
 * Importance of each cell in [0, 1]: how much the similarity dropped when it
 * was hidden, relative to the largest drop. Cells whose removal didn't lower
 * the similarity get 0.
 */
export function importance(baseline: number, occluded: number[]): Float32Array {
  const drops = occluded.map((similarity) =>
    Math.max(0, baseline - similarity),
  );
  const max = Math.max(...drops);
  return Float32Array.from(drops, (drop) => (max > 0 ? drop / max : 0));
}
