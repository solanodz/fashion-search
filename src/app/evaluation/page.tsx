import type { Metadata } from "next";
import Link from "next/link";

import {
  DumbbellChart,
  type DumbbellRow,
} from "@/components/evaluation/dumbbell-chart";
import { SiteHeader } from "@/components/site-header";
import evaluation from "@/content/evaluation.json";

export const metadata: Metadata = {
  title: "Evaluation · Fashion Search",
  description:
    "How retrieval quality changed with each decision: precision@10 over 27 test searches, in English and Spanish.",
};

const REPO = "https://github.com/solanodz/fashion-search";
/** Searches shown before "Show all". */
const VISIBLE_ROWS = 6;
const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? "–" : `${Math.round(value * 100)}%`;

type Run = (typeof evaluation.runs)[number];
const METRICS = [
  ["articleType", "Type"],
  ["baseColour", "Colour"],
  ["gender", "Gender"],
  ["all", "All"],
] as const;

/** One chart row per test search: "all" precision in two runs, in percent. */
function chartRows(before: Run, after: Run, lang: "en" | "es"): DumbbellRow[] {
  return evaluation.queries.map((query, q) => ({
    label: query[lang],
    before: Math.round(before.results[q].all * 100),
    after: Math.round(after.results[q].all * 100),
  }));
}

/** What each step taught, keyed by run id. */
const LESSONS: Record<string, string> = {
  thumbnails:
    "The baseline. CLIP judges by looks, and 60×80 thumbnails give it little to look at.",
  photos:
    "Sharper photos lift every measure a little; the catalog finally looks right.",
  hybrid:
    "The biggest jump. Product names say “Dress” or “Watch” outright, and keywords catch what looks alone confuse.",
  "spanish-raw":
    "The English model and English names don't understand Spanish: 17%.",
  spanish:
    "A glossary for the catalog's vocabulary brings Spanish level with English.",
};

function Bar({ value }: { value: number }) {
  return (
    <span aria-hidden className="block h-1.5 w-full rounded-full bg-rule">
      <span
        className="block h-full rounded-full bg-ink"
        style={{ width: `${value * 100}%` }}
      />
    </span>
  );
}

/** A cell shaded by its value: darker is better. */
function Cell({ value }: { value: number }) {
  return (
    <span
      className="flex h-8 items-center justify-center rounded-sm text-xs tabular-nums"
      style={{
        background: `color-mix(in srgb, var(--ink) ${Math.round(value * 70)}%, transparent)`,
        color: value > 0.55 ? "var(--paper)" : "var(--ink)",
      }}
    >
      {percent(value)}
    </span>
  );
}

export default function EvaluationPage() {
  const runs: Run[] = evaluation.runs;
  const columns = `minmax(10rem,1.6fr) repeat(${runs.length}, minmax(3.5rem,1fr))`;

  const renderRow = (query: (typeof evaluation.queries)[number], q: number) => (
    <li key={query.en}>
      <details className="group">
        <summary
          className="grid cursor-pointer list-none items-center gap-1 py-1.5 [&::-webkit-details-marker]:hidden"
          style={{ gridTemplateColumns: columns }}
        >
          <span className="min-w-0 pr-2 text-sm">
            <span className="block truncate">{query.en}</span>
            <span className="block truncate text-xs text-muted">
              {query.es}
            </span>
          </span>
          {runs.map((run) => (
            <Cell key={run.id} value={run.results[q].all} />
          ))}
        </summary>
        <div
          className="grid gap-1 pb-4 text-xs text-muted"
          style={{ gridTemplateColumns: columns }}
        >
          <span className="pr-2">
            Expected: {Object.values(query.expect).flat().join(", ")}
          </span>
          {runs.map((run) => (
            <ol key={run.id} className="space-y-1 px-1">
              {/* Different products can share a name, so keys are positions. */}
              {run.results[q].top.map((item, rank) => (
                <li key={rank} className="leading-snug">
                  {item}
                </li>
              ))}
            </ol>
          ))}
        </div>
      </details>
    </li>
  );

  return (
    <div className="flex w-full flex-1 flex-col px-5 pt-8 pb-16 sm:px-8 lg:px-10">
      <SiteHeader />
      <main className="mx-auto mt-16 w-full max-w-4xl flex-1">
        <h1 className="text-2xl font-medium tracking-tight">Evaluation</h1>
        <p className="mt-3 max-w-3xl leading-relaxed text-muted">
          Every change to the model, the photos or the search was measured on
          the same {evaluation.queries.length} test searches, such as &ldquo;a
          red dress&rdquo; or &ldquo;black leather wallet for men&rdquo;. For
          each one, the metric is <span className="text-ink">precision@10</span>
          : the share of the top 10 results whose type, colour and gender match
          what was asked. &ldquo;All&rdquo; counts results where every one of
          them matches. No filters are used.
        </p>

        <section aria-labelledby="summary-title" className="mt-16">
          <h2 id="summary-title" className="text-xl font-medium tracking-tight">
            Each decision, measured
          </h2>
          <ol className="mt-6 space-y-8">
            {runs.map((run, index) => (
              <li
                key={run.id}
                className="grid gap-x-8 gap-y-3 md:grid-cols-[16rem_1fr]"
              >
                <div>
                  <p className="font-medium">
                    <span className="mr-2 text-muted tabular-nums">
                      {index + 1}
                    </span>
                    {run.label}
                  </p>
                  <p className="mt-1 text-sm text-muted">{run.description}</p>
                  <p className="mt-1 text-xs text-muted">
                    {LESSONS[run.id]}{" "}
                    <a
                      className="link hover:text-ink"
                      href={`${REPO}/blob/main/docs/adr/${run.adr}`}
                    >
                      ADR
                    </a>
                  </p>
                </div>
                <dl className="grid grid-cols-4 gap-4 self-start">
                  {METRICS.map(([key, label]) => (
                    <div key={key}>
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd
                        className={`mt-1 tabular-nums ${key === "all" ? "text-lg font-medium" : ""}`}
                      >
                        {percent(run.summary[key])}
                      </dd>
                      <dd className="mt-1.5">
                        <Bar value={run.summary[key]} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="queries-title" className="mt-24">
          <h2 id="queries-title" className="text-xl font-medium tracking-tight">
            Search by search
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            &ldquo;All&rdquo; for every test search in each version; darker is
            better. Open a row to see the first three results of each version.
          </p>
          <div className="mt-6 overflow-x-auto">
            <div className="min-w-[38rem]">
              <div
                className="grid items-end gap-1 pb-2 text-xs text-muted"
                style={{ gridTemplateColumns: columns }}
              >
                <span>Search</span>
                {runs.map((run, index) => (
                  <span key={run.id} className="text-center leading-tight">
                    <span className="tabular-nums">{index + 1}</span>{" "}
                    {run.label}
                  </span>
                ))}
              </div>
              <ul className="divide-y divide-rule border-t border-rule">
                {evaluation.queries
                  .slice(0, VISIBLE_ROWS)
                  .map((query, q) => renderRow(query, q))}
              </ul>
              {/* The rest stays folded until asked for; no script needed. */}
              <details className="group/more border-b border-rule">
                <summary className="cursor-pointer list-none py-3 text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                  <span className="link group-open/more:hidden">
                    Show all {evaluation.queries.length} searches
                  </span>
                  <span className="link hidden group-open/more:inline">
                    Show fewer
                  </span>
                </summary>
                <ul className="divide-y divide-rule border-t border-rule">
                  {evaluation.queries
                    .slice(VISIBLE_ROWS)
                    .map((query, i) => renderRow(query, i + VISIBLE_ROWS))}
                </ul>
              </details>
            </div>
          </div>
          <div className="mt-14 grid gap-12 lg:grid-cols-2">
            <DumbbellChart
              title="English: image only → hybrid search"
              description="Precision on all attributes per search, before and after adding keywords."
              beforeLabel="Image only"
              afterLabel="Hybrid"
              rows={chartRows(runs[1], runs[2], "en")}
            />
            <DumbbellChart
              title="Spanish: as typed → with the glossary"
              description="The same searches in Spanish, before and after the glossary."
              beforeLabel="As typed"
              afterLabel="Glossary"
              rows={chartRows(runs[3], runs[4], "es")}
            />
          </div>
        </section>

        <section aria-labelledby="method-title" className="mt-24">
          <h2 id="method-title" className="text-xl font-medium tracking-tight">
            How it&apos;s measured
          </h2>
          <ul className="mt-4 space-y-3 leading-relaxed text-muted">
            <li>
              The test searches and what each one should return are in{" "}
              <a
                className="link hover:text-ink"
                href={`${REPO}/blob/main/src/lib/indexing/eval-queries.json`}
              >
                eval-queries.json
              </a>
              , with a Spanish version of each.
            </li>
            <li>
              Results are judged on the catalog&apos;s own labels, so a result
              counts as wrong when the label is off, even if it looks right (a
              gold watch labelled &ldquo;white&rdquo; for its dial).
            </li>
            <li>
              The glossary was written for the catalog&apos;s vocabulary, which
              these searches share, so free phrasing in Spanish scores lower
              than 78%.
            </li>
            <li>
              Reproduce any row with{" "}
              <code className="text-ink">npm run index:eval</code> (add{" "}
              <code className="text-ink">-- --mode image</code>,{" "}
              <code className="text-ink">-- --lang es</code> or{" "}
              <code className="text-ink">-- --translate</code>); details in{" "}
              <a
                className="link hover:text-ink"
                href={`${REPO}/blob/main/docs/evaluation.md`}
              >
                docs/evaluation.md
              </a>
              .
            </li>
          </ul>
          <p className="mt-10">
            <Link className="link" href="/">
              Try a search
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
