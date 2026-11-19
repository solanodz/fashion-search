/** Scales a vector to unit length so cosine similarity equals the dot product. */
export function l2Normalize(vector: Float32Array): Float32Array {
  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;
  const norm = Math.sqrt(sumOfSquares);
  if (norm === 0 || !Number.isFinite(norm)) {
    throw new Error("Cannot normalize a zero or non-finite vector");
  }
  const result = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) result[i] = vector[i] / norm;
  return result;
}

/** Splits a flat [rows × dimensions] buffer (a batched model output) into normalized rows. */
export function splitRows(
  data: ArrayLike<number>,
  rows: number,
  dimensions: number,
): Float32Array[] {
  if (data.length !== rows * dimensions) {
    throw new Error(
      `Expected ${rows}×${dimensions} values, got ${data.length}`,
    );
  }
  return Array.from({ length: rows }, (_, row) =>
    l2Normalize(
      Float32Array.from(
        Array.prototype.slice.call(
          data,
          row * dimensions,
          (row + 1) * dimensions,
        ),
      ),
    ),
  );
}

/** Dot product; equals cosine similarity for normalized vectors. */
export function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length)
    throw new Error("Vectors must have the same length");
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** Weighted sum of vectors, normalized. Used to combine a photo with a text refinement. */
export function combine(
  parts: { vector: Float32Array; weight: number }[],
): Float32Array {
  if (parts.length === 0) throw new Error("Nothing to combine");
  const length = parts[0].vector.length;
  const sum = new Float32Array(length);
  for (const { vector, weight } of parts) {
    if (vector.length !== length)
      throw new Error("Vectors must have the same length");
    for (let i = 0; i < length; i++) sum[i] += weight * vector[i];
  }
  return l2Normalize(sum);
}
