import { hashToken } from "@/lib/search/keywords";

import { VectorStrip } from "../search/vector-strip";
import { ProductPhoto, sampleVector } from "./figures";

/**
 * Small pieces of the real search UI, one per stage of the search flow, so
 * each step shows what it produces. Decorative: the stage text says it.
 */

const RED_DRESS = 33199;
const NIGHTDRESS = 52406;
const DRESSES = [25908, 37267, 57057];

export function BrowserIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      className="size-3.5"
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M1.5 5.5h13" />
    </svg>
  );
}

export function ServerIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      className="size-3.5"
    >
      <rect x="2" y="2" width="12" height="5" rx="1" />
      <rect x="2" y="9" width="12" height="5" rx="1" />
      <path
        d="M4.5 4.5h.01M4.5 11.5h.01"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

const frame = "mt-3 rounded-md border border-rule p-3";

export function QueryVisual() {
  return (
    <div className="mt-3 flex h-9 items-center gap-1 rounded-md border border-rule pr-1 text-sm">
      <span className="min-w-0 flex-1 truncate px-2.5">a red dress</span>
      <span className="text-xs text-muted">Photo</span>
      <span className="rounded bg-ink px-2 py-1 text-xs text-paper">
        Search
      </span>
    </div>
  );
}

export function EncodeVisual() {
  const vector = sampleVector(3);
  return (
    <div className={frame}>
      <VectorStrip vector={vector} className="block h-4 w-full" />
      <p className="mt-1.5 text-xs text-muted tabular-nums">
        [{Array.from(vector.slice(0, 3), (v) => v.toFixed(2)).join(", ")}, … ]
        512
      </p>
    </div>
  );
}

export function KeywordsVisual() {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
      {["red", "dress"].map((token) => (
        <span
          key={token}
          className="rounded-full border border-rule px-2 py-0.5 tabular-nums"
        >
          {token}{" "}
          <span className="text-muted">→ {hashToken(token).toString(16)}</span>
        </span>
      ))}
    </div>
  );
}

function Thumb({
  id,
  rank,
  score,
}: {
  id: number;
  rank: number;
  score?: number;
}) {
  return (
    <span className="flex flex-col items-center gap-0.5 text-[10px] text-muted tabular-nums">
      <ProductPhoto id={id} className="aspect-[3/4] w-11" />
      <span>
        {rank}
        {score !== undefined ? ` · ${score.toFixed(3)}` : ""}
      </span>
    </span>
  );
}

export function SearchVisual() {
  // Real similarities to "a red dress" (image vectors only).
  return (
    <div className="mt-3 flex gap-2">
      <Thumb id={DRESSES[2]} rank={1} score={0.271} />
      <Thumb id={NIGHTDRESS} rank={2} score={0.269} />
      <Thumb id={RED_DRESS} rank={3} score={0.263} />
    </div>
  );
}

export function FuseVisual() {
  const row = "flex items-center gap-2";
  const label = "w-14 shrink-0 text-xs text-muted";
  return (
    <div className="mt-3 space-y-1.5">
      <div className={row}>
        <span className={label}>Image</span>
        <span data-flow-anchor="fuse-image" className="flex gap-2">
          <Thumb id={NIGHTDRESS} rank={1} />
          <Thumb id={RED_DRESS} rank={2} />
        </span>
      </div>
      <div className={row}>
        <span className={label}>Keywords</span>
        <span data-flow-anchor="fuse-keywords" className="flex gap-2">
          <Thumb id={RED_DRESS} rank={1} />
          <Thumb id={DRESSES[0]} rank={2} />
        </span>
      </div>
    </div>
  );
}

export function ResultsVisual() {
  const results = [
    { id: RED_DRESS, score: 0.263, width: 100 },
    { id: DRESSES[0], score: 0.276, width: 70 },
    { id: NIGHTDRESS, score: 0.269, width: 45 },
  ];
  return (
    <div data-flow-anchor="results-row" className="mt-3 grid grid-cols-3 gap-2">
      {results.map((result, index) => (
        <span key={result.id} className="text-[10px] tabular-nums">
          <ProductPhoto id={result.id} className="aspect-[3/4] w-full" />
          <span className="mt-1 flex items-center gap-1">
            <span className="text-muted">{index + 1}</span>
            <span>{result.score.toFixed(3)}</span>
            <span className="h-px flex-1 bg-rule">
              <span
                className="block h-full bg-ink"
                style={{ width: `${result.width}%` }}
              />
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}
