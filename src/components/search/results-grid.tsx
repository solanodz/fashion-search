import type { SearchResult } from "@/lib/search/schema";

// R2 bucket in production (ADR 0005); local route otherwise. `||` so an empty
// value copied from .env.example still falls back.
export const IMAGE_BASE_URL =
  process.env.NEXT_PUBLIC_IMAGE_BASE_URL || "/images";

export function ResultsGrid({
  results,
  onMoreLikeThis,
}: {
  results: SearchResult[];
  onMoreLikeThis: (result: SearchResult) => void;
}) {
  if (results.length === 0) {
    return (
      <p className="mt-6 text-muted">
        No products match. Try describing the item differently.
      </p>
    );
  }
  // Bars are relative to this result set: CLIP text-to-image similarities
  // sit in a narrow band (around 0.2–0.35), so absolute bars would look equal.
  const scores = results.map((r) => r.score);
  const top = Math.max(...scores);
  const bottom = Math.min(...scores);
  const span = top - bottom || 1;

  return (
    <ol className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-4 gap-y-8">
      {results.map((result, index) => {
        const { id, product, score } = result;
        return (
          <li key={id} className="group text-sm">
            <div className="relative isolate flex aspect-[3/4] items-center justify-center overflow-hidden rounded-sm bg-tile">
              {/* Plain <img>: photos come straight from the image store at their final size. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${IMAGE_BASE_URL}/${id}`}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-contain mix-blend-multiply"
              />
              <button
                type="button"
                className="absolute inset-x-2 bottom-2 rounded-sm bg-paper/90 py-1 text-sm opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
                onClick={() => onMoreLikeThis(result)}
              >
                More like this
              </button>
            </div>

            <div
              className="mt-2.5 flex items-center gap-2 tabular-nums"
              title="Cosine similarity between the query vector and this product's image vector"
            >
              <span className="text-muted">{index + 1}</span>
              <span>{score.toFixed(3)}</span>
              {result.signals?.includes("keywords") && (
                <span
                  className="text-xs text-muted"
                  title="Also found by the keyword search"
                >
                  keyword
                </span>
              )}
              <span aria-hidden className="h-px flex-1 bg-rule">
                <span
                  className="block h-full bg-ink"
                  style={{ width: `${15 + ((score - bottom) / span) * 85}%` }}
                />
              </span>
            </div>
            {result.parts && (
              <p
                className="mt-0.5 text-xs text-muted tabular-nums"
                title="Cosine similarity to the photo and to the text on their own"
              >
                photo {result.parts.photo?.toFixed(3)} · text{" "}
                {result.parts.text?.toFixed(3)}
              </p>
            )}
            <p className="mt-1 line-clamp-2 leading-snug">{product.name}</p>
            <p className="mt-0.5 text-muted">
              {product.articleType}
              {product.baseColour
                ? `, ${product.baseColour.toLowerCase()}`
                : ""}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
