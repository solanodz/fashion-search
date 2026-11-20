import { COLOUR_SWATCHES, swatchFor } from "@/lib/search/colours";

import { IMAGE_BASE_URL } from "@/lib/images";
import { VectorStrip } from "../search/vector-strip";

/**
 * Static replicas of the search UI for the how-it-works guide. They use the
 * same styles and real catalog photos, but don't do anything: each figure
 * is one image for assistive technology, described by its caption.
 */

export function Figure({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="mt-6">
      <div
        role="img"
        aria-label={caption}
        className="rounded-md border border-rule p-5 sm:p-7"
      >
        <div aria-hidden className="pointer-events-none select-none">
          {children}
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-muted">{caption}</figcaption>
    </figure>
  );
}

export function ProductPhoto({
  id,
  className = "",
}: {
  id: number;
  className?: string;
}) {
  return (
    <span
      className={`isolate flex items-center justify-center rounded-sm bg-tile ${className}`}
    >
      {/* Static catalog photo from the image store; next/image adds nothing at this size. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${IMAGE_BASE_URL}/${id}`}
        alt=""
        loading="lazy"
        className="h-full w-full object-contain mix-blend-multiply"
      />
    </span>
  );
}

export function SearchBar({
  text,
  placeholder = "Describe a product, e.g. a red dress",
  photoId,
  photoButton = "Search with a photo",
}: {
  text?: string;
  placeholder?: string;
  photoId?: number;
  photoButton?: string;
}) {
  return (
    <div className="flex h-11 items-center gap-1 rounded-md border border-rule bg-paper pr-1">
      {photoId && (
        <span className="flex shrink-0 items-center gap-1 pl-1">
          <ProductPhoto id={photoId} className="h-8 w-6" />
          <span className="flex size-6 items-center justify-center text-muted">
            ×
          </span>
        </span>
      )}
      <span
        className={`min-w-0 flex-1 truncate px-3 ${text ? "" : "text-muted/70"}`}
      >
        {text ?? placeholder}
      </span>
      <span className="hidden shrink-0 px-2 text-sm text-muted sm:inline">
        {photoButton}
      </span>
      <span className="shrink-0 rounded bg-ink px-3 py-1.5 text-sm text-paper">
        Search
      </span>
    </div>
  );
}

export type SampleResult = {
  id: number;
  name: string;
  detail: string;
  score: number;
  keyword?: boolean;
  parts?: { photo: number; text: number };
};

export function ResultTiles({
  results,
  moreLikeThis,
}: {
  results: SampleResult[];
  /** Index of a tile that shows its "More like this" button. */
  moreLikeThis?: number;
}) {
  const top = Math.max(...results.map((r) => r.score));
  const bottom = Math.min(...results.map((r) => r.score));
  const span = top - bottom || 1;
  return (
    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4">
      {results.map((result, index) => (
        <div key={result.id} className="text-sm">
          <span className="relative block">
            <ProductPhoto id={result.id} className="aspect-[3/4] w-full" />
            {moreLikeThis === index && (
              <span className="absolute inset-x-2 bottom-2 rounded-sm bg-paper/90 py-1 text-center text-sm">
                More like this
              </span>
            )}
          </span>
          <span className="mt-2 flex items-center gap-2 tabular-nums">
            <span className="text-muted">{index + 1}</span>
            <span>{result.score.toFixed(3)}</span>
            {result.keyword && (
              <span className="text-xs text-muted">keyword</span>
            )}
            <span className="h-px flex-1 bg-rule">
              <span
                className="block h-full bg-ink"
                style={{
                  width: `${15 + ((result.score - bottom) / span) * 85}%`,
                }}
              />
            </span>
          </span>
          {result.parts && (
            <span className="mt-0.5 block text-xs text-muted tabular-nums">
              photo {result.parts.photo.toFixed(3)} · text{" "}
              {result.parts.text.toFixed(3)}
            </span>
          )}
          <span className="mt-1 line-clamp-2 block leading-snug">
            {result.name}
          </span>
          <span className="mt-0.5 block text-muted">{result.detail}</span>
        </div>
      ))}
    </div>
  );
}

export function DropZone() {
  return (
    <div className="mt-4 flex h-28 items-center justify-center rounded-md border border-dashed border-muted text-muted">
      Drop a photo to search with it
    </div>
  );
}

export function FilterReplica() {
  const colours = Object.keys(COLOUR_SWATCHES).slice(0, 24);
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
      <div className="flex w-full flex-col gap-2 sm:w-52">
        {[
          ["Women", true],
          ["Apparel", false],
          ["Dresses", true],
        ].map(([label, selected]) => (
          <span
            key={String(label)}
            className={`flex h-8 items-center justify-between rounded-md border px-3 text-sm ${selected ? "border-ink" : "border-rule"}`}
          >
            {label}
            <span className="text-muted">⌄</span>
          </span>
        ))}
      </div>
      <div>
        <span className="text-sm text-muted">Colour</span>
        <span className="mt-2 flex max-w-64 flex-wrap gap-1.5">
          {colours.map((colour) => (
            <span
              key={colour}
              className={`size-4 rounded-full border border-rule ${colour === "Red" ? "ring-1 ring-ink ring-offset-2 ring-offset-paper" : ""} ${colour === "Gold" ? "opacity-25" : ""}`}
              style={{ background: swatchFor(colour) }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

export function UrlBar({ url }: { url: string }) {
  return (
    <div className="flex h-9 items-center gap-2 overflow-hidden rounded-md border border-rule px-3 text-sm text-ink">
      <span className="text-muted">↻</span>
      <span className="truncate">{url}</span>
    </div>
  );
}

/** A deterministic stand-in for a 512-dimension embedding, for illustration. */
export function sampleVector(seed = 1): Float32Array {
  return Float32Array.from({ length: 512 }, (_, i) => {
    const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    return (x - Math.floor(x) - 0.5) * (i % 7 === 0 ? 0.3 : 0.1);
  });
}

export function VectorFigure() {
  const vector = sampleVector();
  return (
    <div>
      <VectorStrip vector={vector} className="block h-6 w-full" />
      <p className="mt-2 text-sm text-muted tabular-nums">
        [{Array.from(vector.slice(0, 5), (v) => v.toFixed(3)).join(", ")}, … 507
        more]
      </p>
    </div>
  );
}
