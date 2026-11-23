"use client";

import {
  type FormEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { ProductTiles } from "@/components/product-tiles";
import {
  MAX_REQUEST_LENGTH,
  type PlanQuery,
  planQueries,
  type ShoppingPlan,
} from "@/lib/assistant/plan";
import {
  encodeText,
  type ModelProgress,
  onModelProgress,
} from "@/lib/clip/client";
import { queryKeywords } from "@/lib/search/keywords";
import type {
  SearchFilters,
  SearchResponse,
  SearchResult,
} from "@/lib/search/schema";

/**
 * Shopping assistant (ADR 0014): a request in plain language goes to a
 * small language model, which answers with a plan of catalog searches. The
 * plan is shown as it is, and each search then runs like any other: its
 * text is encoded by CLIP in this browser and sent to /api/search.
 */

const EXAMPLES = [
  "Outfit para una boda de verano, hombre, nada de negro",
  "Gym clothes for women, no pink",
  "Un regalo para mi papá, que usa reloj",
  "What to wear to a job interview, women",
];

const RESULTS_PER_SEARCH = 6;

/** Fewer results than this and the search is tried again with fewer filters. */
const MIN_RESULTS = 3;

/** Milliseconds, for the timings shown after a plan runs. */
const now = () => performance.now();

/** Which filter was dropped to find enough products, if any. */
type Relaxed = "gender" | "type" | null;

type Row = { query: PlanQuery; results: SearchResult[]; relaxed: Relaxed };

type Status =
  | { kind: "idle" }
  | { kind: "working"; step: "planning" | "searching" }
  | {
      kind: "done";
      plan: ShoppingPlan;
      rows: Row[];
      ms: { plan: number; search: number };
    }
  | { kind: "unavailable"; request: string }
  | { kind: "error"; message: string };

type PlanOutcome =
  { plan: ShoppingPlan } | { unavailable: true } | { error: string };

async function fetchPlan(request: string): Promise<PlanOutcome> {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request }),
  });
  if (response.status === 501) return { unavailable: true };
  const body = (await response.json()) as ShoppingPlan & { error?: string };
  if (!response.ok) {
    return { error: body.error ?? "Couldn't plan that request right now." };
  }
  return { plan: body };
}

async function searchCatalog(
  vector: Float32Array,
  query: PlanQuery,
  filters: SearchFilters,
): Promise<SearchResult[]> {
  const keywords = queryKeywords(query.query);
  const response = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vector: Array.from(vector),
      filters,
      ...(query.exclude.baseColour ? { exclude: query.exclude } : {}),
      limit: RESULTS_PER_SEARCH,
      ...(keywords ? { keywords } : {}),
    }),
  });
  const body = (await response.json()) as SearchResponse & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Search failed.");
  return body.results;
}

/**
 * Runs one planned search. The catalog is uneven (few products for children,
 * many unisex bags and watches), so a search that finds almost nothing is
 * tried again without the gender, then without the type. Colours to avoid
 * are never dropped.
 */
async function runQuery(query: PlanQuery): Promise<Row> {
  const vector = await encodeText(query.query);
  const { gender, articleType } = query.filters;
  const attempts: { filters: SearchFilters; relaxed: Relaxed }[] = [
    { filters: query.filters, relaxed: null },
    ...(gender
      ? [{ filters: { articleType }, relaxed: "gender" as const }]
      : []),
    ...(articleType ? [{ filters: {}, relaxed: "type" as const }] : []),
  ];
  let best: Row = { query, results: [], relaxed: null };
  for (const { filters, relaxed } of attempts) {
    const results = await searchCatalog(vector, query, filters);
    if (results.length > best.results.length)
      best = { query, results, relaxed };
    if (results.length >= MIN_RESULTS) break;
  }
  return best;
}

function requestFromUrl(): string {
  return (
    new URLSearchParams(window.location.search)
      .get("q")
      ?.trim()
      .slice(0, MAX_REQUEST_LENGTH) ?? ""
  );
}

export function AssistantExperience() {
  const [request, setRequest] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const latest = useRef(0);
  const restored = useRef(false);

  useEffect(() => onModelProgress(setProgress), []);

  async function run(text: string, history: "push" | "none" = "push") {
    const trimmed = text.trim();
    if (trimmed.length < 3) return;
    if (history === "push" && trimmed !== requestFromUrl()) {
      window.history.pushState(
        null,
        "",
        `${window.location.pathname}?q=${encodeURIComponent(trimmed)}`,
      );
    }
    const id = ++latest.current;
    setStatus({ kind: "working", step: "planning" });
    try {
      const planStart = now();
      const outcome = await fetchPlan(trimmed);
      if (id !== latest.current) return;
      if ("unavailable" in outcome) {
        setStatus({ kind: "unavailable", request: trimmed });
        return;
      }
      if ("error" in outcome) {
        setStatus({ kind: "error", message: outcome.error });
        return;
      }
      const planMs = now() - planStart;
      setStatus({ kind: "working", step: "searching" });
      const searchStart = now();
      const rows = await Promise.all(planQueries(outcome.plan).map(runQuery));
      if (id !== latest.current) return;
      setStatus({
        kind: "done",
        plan: outcome.plan,
        rows,
        ms: { plan: planMs, search: now() - searchStart },
      });
    } catch (error) {
      if (id !== latest.current) return;
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Shows the request in the URL: on load and on back/forward. */
  const restore = useEffectEvent(() => {
    const fromUrl = requestFromUrl();
    setRequest(fromUrl);
    if (fromUrl) void run(fromUrl, "none");
    else {
      latest.current++;
      setStatus({ kind: "idle" });
    }
  });

  useEffect(() => {
    const fromUrl = () => restore();
    // Once per page load: in development React mounts effects twice, and
    // each run would pay for a plan.
    if (window.location.search && !restored.current) {
      restored.current = true;
      fromUrl();
    }
    window.addEventListener("popstate", fromUrl);
    return () => window.removeEventListener("popstate", fromUrl);
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run(request);
  }

  const working = status.kind === "working";
  const downloading =
    working &&
    progress &&
    progress.total > 0 &&
    progress.loaded < progress.total;

  return (
    <div>
      <form
        onSubmit={onSubmit}
        className="flex h-11 items-center gap-1 rounded-md border border-rule bg-paper pr-1 transition-colors focus-within:border-muted"
      >
        <input
          className="h-full min-w-0 flex-1 bg-transparent px-3 placeholder:text-muted/70 focus-visible:outline-none"
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          maxLength={MAX_REQUEST_LENGTH}
          placeholder="What do you need?"
          aria-label="What are you shopping for?"
          autoComplete="off"
          enterKeyHint="search"
        />
        <button
          type="submit"
          className="shrink-0 rounded bg-ink px-3 py-1.5 text-sm text-paper hover:opacity-85"
        >
          Plan it
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span>Try</span>
        <ul className="contents">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button
                type="button"
                className="link text-left hover:text-ink"
                onClick={() => {
                  setRequest(example);
                  void run(example);
                }}
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted">
        Your request is sent to a small OpenAI model, which only plans the
        searches, and isn&apos;t stored. The searches run like any other: each
        text is encoded in this browser and matched against the catalog.
      </p>

      <section aria-label="Plan" aria-busy={working} className="mt-10">
        <div className="min-h-6 text-sm text-muted" aria-live="polite">
          {working && (
            <p>
              {status.step === "planning"
                ? "Planning the searches…"
                : "Searching the catalog…"}
              {downloading &&
                ` Downloading the model: ${Math.round((progress.loaded / progress.total) * 100)}% (first time only).`}
            </p>
          )}
          {status.kind === "error" && (
            <p role="alert" className="text-ink">
              {status.message}
            </p>
          )}
          {status.kind === "unavailable" && (
            <p className="text-ink">
              The assistant isn&apos;t set up on this server. You can still{" "}
              <a
                className="link"
                href={`/?q=${encodeURIComponent(status.request)}`}
              >
                search for “{status.request}”
              </a>{" "}
              directly.
            </p>
          )}
          {status.kind === "done" && (
            <>
              <p className="text-base text-ink">{status.plan.summary}</p>
              {status.rows.length > 0 && (
                <p className="mt-1 tabular-nums">
                  {status.rows.length}{" "}
                  {status.rows.length === 1 ? "search" : "searches"}
                  {` · planned in ${Math.round(status.ms.plan)} ms`}
                  {` · searched in ${Math.round(status.ms.search)} ms`}
                </p>
              )}
            </>
          )}
        </div>

        {status.kind === "done" && status.rows.length > 0 && (
          <ol className="mt-8 space-y-10">
            {status.rows.map(({ query, results, relaxed }, index) => (
              <li key={`${index}-${query.query}`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <h2 className="font-medium">{query.title}</h2>
                  <p className="text-sm">{query.query}</p>
                  <p className="text-xs text-muted">
                    {planDetail(query, status.plan.gender, relaxed)}
                  </p>
                </div>
                <div className="mt-3">
                  {results.length === 0 ? (
                    <p className="text-sm text-muted">
                      Nothing in the catalog matches this one.
                    </p>
                  ) : (
                    <ProductTiles results={results} columns="six" />
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** The filters a planned search ran with, in a line: "Shirts · Men · no black". */
function planDetail(
  query: PlanQuery,
  gender: ShoppingPlan["gender"],
  relaxed: Relaxed,
): string {
  const { articleType } = query.filters;
  const parts = [
    relaxed === "type" ? null : articleType,
    relaxed === null ? gender : null,
    ...(query.exclude.baseColour ?? []).map(
      (colour) => `no ${colour.toLowerCase()}`,
    ),
  ].filter(Boolean);
  const note =
    relaxed === "gender" && gender
      ? `few for ${gender.toLowerCase()}, so any gender`
      : relaxed === "type" && articleType
        ? `few ${articleType.toLowerCase()}, so any type`
        : null;
  return [...parts, note].filter(Boolean).join(" · ");
}
