import type { SearchResult } from "@/lib/search/schema";

import { IMAGE_BASE_URL } from "@/lib/images";

/**
 * The same search three ways, side by side: the image vectors alone (CLIP),
 * the keyword vectors alone (BM25), and the hybrid list the search shows,
 * which merges both by rank. Each hybrid result says which ranks it came
 * from, so the fusion can be read row by row.
 */

const SHOWN = 10;

type Lists = { image: SearchResult[]; keywords: SearchResult[] };

function rankMap(list: SearchResult[]) {
  return new Map(list.map((result, index) => [result.id, index + 1]));
}

function Row({
  rank,
  result,
  detail,
  highlight,
}: {
  rank: number;
  result: SearchResult;
  detail: string;
  highlight: boolean;
}) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span className="w-4 shrink-0 text-right text-xs text-muted tabular-nums">
        {rank}
      </span>
      <span className="isolate flex aspect-[3/4] w-10 shrink-0 rounded-sm bg-tile">
        {/* Plain <img>: catalog photos straight from the image store. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${IMAGE_BASE_URL}/${result.id}`}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain mix-blend-multiply"
        />
      </span>
      <span className="min-w-0 text-sm">
        <span
          className={`line-clamp-2 leading-snug ${highlight ? "" : "text-muted"}`}
        >
          {result.product.name}
        </span>
        <span className="block text-xs text-muted tabular-nums">{detail}</span>
      </span>
    </li>
  );
}

function Column({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-0.5 text-xs text-muted">{description}</p>
      <ol className="mt-3 divide-y divide-rule">{children}</ol>
    </section>
  );
}

export function CompareView({
  lists,
  results,
}: {
  lists: Lists;
  results: SearchResult[];
}) {
  const imageRanks = rankMap(lists.image);
  const keywordRanks = rankMap(lists.keywords);
  const inBoth = lists.image.filter((r) => keywordRanks.has(r.id)).length;
  const fused = results.slice(0, SHOWN);

  return (
    <div>
      <p className="text-sm text-muted">
        {inBoth} of the top {lists.image.length} image matches are also keyword
        matches. Products near the top of both lists rise in the hybrid ranking;
        products only one list found sink. Dark names are in the hybrid top{" "}
        {SHOWN}.
      </p>
      <div className="mt-6 grid gap-8 md:grid-cols-3">
        <Column
          title="Image only"
          description="CLIP: closest product photos to the query vector, by cosine similarity"
        >
          {lists.image.slice(0, SHOWN).map((result, i) => (
            <Row
              key={result.id}
              rank={i + 1}
              result={result}
              detail={`cosine ${result.score.toFixed(3)}`}
              highlight={fused.some((r) => r.id === result.id)}
            />
          ))}
        </Column>
        <Column
          title="Keywords only"
          description="BM25: product names that contain the query's words"
        >
          {lists.keywords.length === 0 ? (
            <li className="py-2 text-sm text-muted">
              No product name matches.
            </li>
          ) : (
            lists.keywords
              .slice(0, SHOWN)
              .map((result, i) => (
                <Row
                  key={result.id}
                  rank={i + 1}
                  result={result}
                  detail={`BM25 ${result.keywordScore?.toFixed(2) ?? "–"} · cosine ${result.score.toFixed(3)}`}
                  highlight={fused.some((r) => r.id === result.id)}
                />
              ))
          )}
        </Column>
        <Column
          title="Hybrid"
          description="What the search shows: both lists merged by rank (RRF)"
        >
          {fused.map((result, i) => {
            const fromImage = result.ranks?.image ?? imageRanks.get(result.id);
            const fromKeywords =
              result.ranks?.keywords ?? keywordRanks.get(result.id);
            const origin = [
              fromImage ? `image #${fromImage}` : null,
              fromKeywords ? `keywords #${fromKeywords}` : null,
            ]
              .filter(Boolean)
              .join(" + ");
            return (
              <Row
                key={result.id}
                rank={i + 1}
                result={result}
                detail={origin || "from deeper in the lists"}
                highlight
              />
            );
          })}
        </Column>
      </div>
    </div>
  );
}
