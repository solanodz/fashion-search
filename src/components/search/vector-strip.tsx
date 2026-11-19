/**
 * A 512-dimension embedding drawn as a strip: one column per dimension, ink
 * for positive values and grey for negative ones, opacity by magnitude.
 * Scaled to 2.5× the root mean square rather than the maximum, so one outlier
 * dimension doesn't wash the rest out.
 */
export function VectorStrip({
  vector,
  className = "",
}: {
  vector: Float32Array | null;
  className?: string;
}) {
  if (!vector) {
    return <span aria-hidden className={`bg-rule ${className}`} />;
  }
  let squares = 0;
  for (const value of vector) squares += value * value;
  const scale = 2.5 * Math.sqrt(squares / vector.length);
  return (
    <svg
      role="img"
      aria-label={`Query vector, ${vector.length} dimensions`}
      viewBox={`0 0 ${vector.length} 1`}
      preserveAspectRatio="none"
      className={className}
    >
      {Array.from(vector, (value, i) => (
        <rect
          key={i}
          x={i}
          width={1}
          height={1}
          className={value >= 0 ? "fill-ink" : "fill-muted"}
          opacity={scale ? Math.min(1, Math.abs(value) / scale) : 0}
        />
      ))}
    </svg>
  );
}
