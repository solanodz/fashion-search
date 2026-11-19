import type { SearchResult } from "@/lib/search/schema";

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? "/images";

export function ResultsGrid({ results }: { results: SearchResult[] }) {
  if (results.length === 0) {
    return (
      <p className="mt-10 text-graphite">
        No products match. Try describing the item differently.
      </p>
    );
  }
  return (
    <ul className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-3 gap-y-6">
      {results.map(({ id, product }) => (
        <li key={id}>
          <div className="flex aspect-[3/4] items-center justify-center rounded-sm bg-tile p-3">
            {/* Catalog images are 60×80 thumbnails; next/image optimization adds nothing here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${IMAGE_BASE_URL}/${id}`}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-contain"
            />
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-snug font-medium">
            {product.name}
          </p>
          <p className="mt-0.5 text-sm text-graphite">
            {product.articleType}
            {product.baseColour ? `, ${product.baseColour.toLowerCase()}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
