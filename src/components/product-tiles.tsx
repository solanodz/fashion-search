import { IMAGE_BASE_URL } from "@/lib/images";
import type { SearchResult } from "@/lib/search/schema";

/**
 * A compact row of results, for pages that show several searches at once
 * (Shop the look, the shopping assistant). Each tile opens the main search
 * with that product's photo.
 */
export function ProductTiles({
  results,
  columns = "auto",
}: {
  results: SearchResult[];
  /** "six" keeps six results in full rows: three per row on a phone. */
  columns?: "auto" | "six";
}) {
  return (
    <ul
      className={`grid gap-x-3 gap-y-4 ${columns === "six" ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]"}`}
    >
      {results.map((result) => (
        <li key={result.id} className="text-xs">
          <a
            href={`/?like=${result.id}`}
            className="group block"
            title="Find more like this"
          >
            <span className="relative isolate flex aspect-[3/4] items-center justify-center overflow-hidden rounded-sm bg-tile">
              {/* Plain <img>: photos come straight from the image store at their final size. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${IMAGE_BASE_URL}/${result.id}`}
                alt={result.product.name}
                loading="lazy"
                className="h-full w-full object-contain mix-blend-multiply"
              />
            </span>
            <span className="mt-1.5 block text-muted tabular-nums">
              {result.score.toFixed(3)}
            </span>
            <span className="mt-0.5 line-clamp-2 leading-snug group-hover:underline">
              {result.product.name}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
