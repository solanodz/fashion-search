import { IMAGE_BASE_URL } from "@/lib/images";
import type { SearchResult } from "@/lib/search/schema";

/** Like and Dislike appear with the tile's other buttons. */
const MARK_BUTTON = "rounded-sm bg-paper/90 px-2 py-0.5 text-xs";

export function ResultsGrid({
  results,
  onMoreLikeThis,
  onMark,
}: {
  results: SearchResult[];
  onMoreLikeThis: (result: SearchResult) => void;
  /** Marks a result to refine the search: more like it, or less (ADR 0016). */
  onMark?: (result: SearchResult, as: "like" | "dislike") => void;
}) {
  if (results.length === 0) {
    return (
      <p className="mt-6 text-muted">
        No products match. Try describing the item differently.
      </p>
    );
  }
  return (
    <ol className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-8">
      {results.map((result) => {
        const { id, product } = result;
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
              {onMark && (
                <span className="absolute inset-x-2 top-2 flex justify-between opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
                  <button
                    type="button"
                    className={MARK_BUTTON}
                    title="Show more results like this one"
                    aria-label={`Like ${product.name}`}
                    onClick={() => onMark(result, "like")}
                  >
                    Like
                  </button>
                  <button
                    type="button"
                    className={MARK_BUTTON}
                    title="Show fewer results like this one"
                    aria-label={`Dislike ${product.name}`}
                    onClick={() => onMark(result, "dislike")}
                  >
                    Dislike
                  </button>
                </span>
              )}
              <button
                type="button"
                className="absolute inset-x-2 bottom-2 rounded-sm bg-paper/90 py-1 text-sm opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
                onClick={() => onMoreLikeThis(result)}
              >
                More like this
              </button>
            </div>

            <p className="mt-2.5 line-clamp-2 leading-snug">{product.name}</p>
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
