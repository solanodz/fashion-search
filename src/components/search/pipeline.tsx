import type { ModelProgress } from "@/lib/clip/client";
import { CLIP_DIMENSIONS, COMBINED_TEXT_WEIGHT } from "@/lib/clip/config";

import { VectorStrip } from "./vector-strip";

/** What the last search did, step by step. */
export type Trace = {
  query: string;
  encoders: ("text" | "image")[];
  encodeMs: number;
  /** The encoder was used for the first time, so encodeMs includes loading it. */
  firstRun: boolean;
  vector: Float32Array;
  searchMs: number;
  results: number;
};

const number = new Intl.NumberFormat("en");
const ms = (value: number) => `${number.format(Math.round(value))} ms`;

/**
 * The search pipeline, shown live: the query, CLIP in the browser, the
 * resulting vector and the nearest-neighbour search in Qdrant. Before the
 * first search each step explains itself.
 */
export function Pipeline({
  trace,
  progress,
  matching,
}: {
  trace: Trace | null;
  progress: ModelProgress | null;
  /** Products matching the current filters, from the facet counts. */
  matching: number | null;
}) {
  const downloading = progress && progress.loaded < progress.total;
  const percent = progress
    ? Math.round((progress.loaded / progress.total) * 100)
    : 0;
  const encoder = trace
    ? trace.encoders.length === 2
      ? `Photo + ${COMBINED_TEXT_WEIGHT}× text`
      : trace.encoders[0] === "image"
        ? "Image encoder"
        : "Text encoder"
    : "Text or image encoder";

  return (
    <section aria-labelledby="pipeline-title">
      <h2 id="pipeline-title" className="font-medium">
        How it works
      </h2>
      <ol className="mt-4 flex flex-col gap-5">
        <Step title="Query" detail="Stays in this browser">
          <span className="block truncate" title={trace?.query}>
            {trace ? trace.query : "Text, a photo, or both"}
          </span>
        </Step>
        <Step
          title="CLIP ViT-B/32"
          detail={
            downloading
              ? `Downloading the model, ${Math.round(progress.loaded / 1e6)} of ${Math.round(progress.total / 1e6)} MB`
              : trace
                ? `${ms(trace.encodeMs)} in this browser${trace.firstRun ? ", including model start-up" : ""}`
                : "Runs in this browser"
          }
        >
          {downloading ? (
            <span
              className="mt-2 block h-px w-full bg-rule"
              role="progressbar"
              aria-label="Model download"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span
                className="block h-full bg-ink"
                style={{ width: `${percent}%` }}
              />
            </span>
          ) : (
            encoder
          )}
        </Step>
        <Step
          title={`Embedding, ${CLIP_DIMENSIONS} dimensions`}
          detail={
            trace
              ? `[${Array.from(trace.vector.slice(0, 3), (v) => v.toFixed(3)).join(", ")}, …]`
              : "The only thing sent to the server"
          }
        >
          <VectorStrip
            vector={trace?.vector ?? null}
            className="mt-1 block h-4 w-full"
          />
        </Step>
        <Step
          title="Qdrant, cosine similarity"
          detail={
            trace ? ms(trace.searchMs) : "Nearest neighbours to the query"
          }
        >
          {trace
            ? `Top ${trace.results} of ${matching === null ? "the catalog" : number.format(matching)}`
            : matching
              ? `${number.format(matching)} product images`
              : "Product image vectors"}
        </Step>
      </ol>
    </section>
  );
}

function Step({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-0.5">
      <span className="text-sm text-muted">{title}</span>
      <span className="min-w-0">
        <span className="block">{children}</span>
        <span className="block text-sm text-muted tabular-nums">{detail}</span>
      </span>
    </li>
  );
}
