"use client";

import { useState } from "react";

import { explainMatch } from "@/lib/clip/client";
import { IMAGE_BASE_URL } from "@/lib/images";
import type { SearchResult } from "@/lib/search/schema";

/** Occlusion grid for "Why?": 4 × 5 cells fit the 3:4 product photos. */
const COLS = 4;
const ROWS = 5;

type Explanation =
  | { id: number; status: "loading" }
  | { id: number; status: "done"; heat: Float32Array }
  | { id: number; status: "error" };

export function ResultsGrid({
  results,
  onMoreLikeThis,
  query,
}: {
  results: SearchResult[];
  onMoreLikeThis: (result: SearchResult) => void;
  /** The query vector, for "Why?"; without it the button is hidden. */
  query?: Float32Array | null;
}) {
  const [explanation, setExplanation] = useState<Explanation | null>(null);

  async function explain(result: SearchResult) {
    if (!query) return;
    if (explanation?.id === result.id) return setExplanation(null);
    setExplanation({ id: result.id, status: "loading" });
    try {
      const response = await fetch(`${IMAGE_BASE_URL}/${result.id}`);
      if (!response.ok) throw new Error(String(response.status));
      const heat = await explainMatch(await response.blob(), query, COLS, ROWS);
      setExplanation((current) =>
        current?.id === result.id
          ? { id: result.id, status: "done", heat }
          : current,
      );
    } catch {
      setExplanation((current) =>
        current?.id === result.id
          ? { id: result.id, status: "error" }
          : current,
      );
    }
  }

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
    <ol className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-8">
      {results.map((result, index) => {
        const { id, product, score } = result;
        const shown = explanation?.id === id ? explanation : null;
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
              {shown?.status === "done" && (
                // Dims what mattered least, so the regions that made the
                // product match stay bright.
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-3 grid blur-md"
                  style={{
                    gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                    gridTemplateRows: `repeat(${ROWS}, 1fr)`,
                  }}
                >
                  {Array.from(shown.heat, (value, cell) => (
                    <span
                      key={cell}
                      className="bg-black transition-opacity duration-300 motion-reduce:transition-none"
                      style={{ opacity: (1 - value) * 0.62 }}
                    />
                  ))}
                </span>
              )}
              {query && (
                <button
                  type="button"
                  aria-pressed={shown?.status === "done"}
                  className={`absolute top-2 right-2 rounded-sm bg-paper/90 px-2 py-0.5 text-xs transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100 ${shown ? "opacity-100" : "opacity-0"}`}
                  onClick={() => void explain(result)}
                >
                  {shown?.status === "loading"
                    ? "Looking…"
                    : shown?.status === "done"
                      ? "Hide"
                      : "Why?"}
                </button>
              )}
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
            {shown && (
              <p className="mt-0.5 text-xs text-muted" aria-live="polite">
                {shown.status === "loading"
                  ? "Hiding each part of the photo to see what the match depends on…"
                  : shown.status === "done"
                    ? "Bright areas made it match; dimmed ones barely mattered."
                    : "Couldn't analyse this photo."}
              </p>
            )}
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
