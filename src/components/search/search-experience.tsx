"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import {
  encodeText,
  type ModelProgress,
  onModelProgress,
  warmUpTextModel,
} from "@/lib/clip/client";
import type { SearchResponse, SearchResult } from "@/lib/search/schema";

import { ResultsGrid } from "./results-grid";

const SUGGESTIONS = [
  "white running shoes",
  "a black leather handbag",
  "gold earrings",
  "men's blue jeans",
];

type Status =
  | { kind: "idle" }
  | { kind: "searching"; query: string }
  | { kind: "done"; query: string; results: SearchResult[] }
  | { kind: "error"; message: string };

export function SearchExperience() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const latest = useRef(0);

  useEffect(() => onModelProgress(setProgress), []);

  async function search(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const run = ++latest.current;
    setStatus({ kind: "searching", query: trimmed });
    try {
      const vector = await encodeText(trimmed);
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: Array.from(vector), limit: 36 }),
      });
      const body = (await response.json()) as SearchResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Search failed.");
      if (run === latest.current)
        setStatus({ kind: "done", query: trimmed, results: body.results });
    } catch (error) {
      if (run === latest.current) {
        setStatus({
          kind: "error",
          message: error instanceof Error ? error.message : "Search failed.",
        });
      }
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void search(query);
  }

  const downloading = progress && progress.loaded < progress.total;

  return (
    <section aria-label="Search the catalog">
      <form onSubmit={onSubmit} role="search">
        <label className="search-sentence block text-[clamp(2.6rem,7.5vw,6.5rem)] leading-[0.95] font-bold tracking-[-0.035em]">
          <span>Show me </span>
          <input
            className="search-input min-w-[4ch] border-indigo bg-transparent text-indigo caret-indigo placeholder:text-rule"
            style={
              {
                "--chars": (query || "a red dress").length,
              } as React.CSSProperties
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={warmUpTextModel}
            placeholder="a red dress"
            aria-label="Describe what you are looking for"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
        </label>
      </form>

      <div className="mt-6 flex min-h-8 flex-wrap items-center gap-2 text-base text-graphite">
        {downloading ? (
          <ModelDownload progress={progress} />
        ) : status.kind === "idle" ? (
          SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-full border border-rule px-3 py-1 transition-colors hover:border-indigo hover:text-indigo"
              onClick={() => {
                setQuery(suggestion);
                void search(suggestion);
              }}
            >
              {suggestion}
            </button>
          ))
        ) : status.kind === "searching" ? (
          <p aria-live="polite">Searching for “{status.query}”…</p>
        ) : status.kind === "done" ? (
          <p aria-live="polite">
            {status.results.length} closest matches for “{status.query}”
          </p>
        ) : (
          <p role="alert" className="text-ink">
            {status.message}
          </p>
        )}
      </div>

      {status.kind === "done" && <ResultsGrid results={status.results} />}
    </section>
  );
}

function ModelDownload({ progress }: { progress: ModelProgress }) {
  const mb = (bytes: number) => Math.round(bytes / 1_000_000);
  const percent = Math.round((progress.loaded / progress.total) * 100);
  return (
    <div className="w-full max-w-md" aria-live="polite">
      <p>
        Downloading the search model, {mb(progress.loaded)} of{" "}
        {mb(progress.total)} MB. This happens once.
      </p>
      <div
        className="mt-2 h-1 w-full bg-rule"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-indigo transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
