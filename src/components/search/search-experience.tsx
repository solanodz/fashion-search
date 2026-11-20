"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import {
  encodeImage,
  encodeText,
  type ModelProgress,
  onModelProgress,
  warmUpTextModel,
} from "@/lib/clip/client";
import { COMBINED_TEXT_WEIGHT } from "@/lib/clip/config";
import { combine } from "@/lib/clip/vector";
import type { Facets } from "@/lib/search/facets";
import { queryKeywords, tokenize } from "@/lib/search/keywords";
import { translateQuery } from "@/lib/search/spanish";
import type {
  SearchFilters,
  SearchResponse,
  SearchResult,
} from "@/lib/search/schema";
import {
  parseSearchState,
  type SearchState,
  serializeSearchState,
} from "@/lib/search/url-state";

import { EmbeddingMapView, ExpandedMap } from "./embedding-map";
import { CompareView } from "./compare-view";
import { Filters } from "./filters";
import { PhotoChip } from "./photo-chip";
import { Pipeline, type Trace } from "./pipeline";
import { IMAGE_BASE_URL, ResultsGrid } from "./results-grid";

const SUGGESTIONS = [
  "white running shoes",
  "a black leather handbag",
  "gold earrings",
  "men's blue jeans",
];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** The query photo. `productId` is set for a catalog product's photo, which can be shared by URL. */
export type Photo = {
  blob: Blob;
  label: string;
  productId?: number;
};

/** How a search changes the browser history. */
type HistoryMode = "push" | "replace" | "none";

function writeUrl(state: SearchState, mode: HistoryMode) {
  if (mode === "none") return;
  const url = `${window.location.pathname}${serializeSearchState(state)}`;
  if (url === `${window.location.pathname}${window.location.search}`) return;
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
}

type Status =
  | { kind: "idle" }
  | { kind: "searching" }
  | {
      kind: "done";
      description: string;
      results: SearchResult[];
      lists?: SearchResponse["lists"];
    }
  | { kind: "error"; message: string };

export function SearchExperience() {
  const [query, setQuery] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const [dragging, setDragging] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [facets, setFacets] = useState<Facets | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [view, setView] = useState<"results" | "compare">("results");
  const latest = useRef(0);
  const usedEncoders = useRef(new Set<string>());
  const photoVectors = useRef(new WeakMap<Blob, Float32Array>());
  const fileInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLInputElement>(null);

  useEffect(() => onModelProgress(setProgress), []);

  // Filter values and counts for the current selection. Search still works if this fails.
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v) as [string, string][],
    );
    fetch(`/api/facets?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { facets: Facets } | null) => body && setFacets(body.facets))
      .catch(() => {});
    return () => controller.abort();
  }, [filters]);

  async function photoVector(current: Photo): Promise<Float32Array> {
    const cached = photoVectors.current.get(current.blob);
    if (cached) return cached;
    const vector = await encodeImage(current.blob);
    photoVectors.current.set(current.blob, vector);
    return vector;
  }

  async function search(
    text: string,
    currentPhoto: Photo | null,
    currentFilters: SearchFilters = filters,
    history: HistoryMode = "push",
  ) {
    const trimmed = text.trim();
    if (!trimmed && !currentPhoto) return;
    writeUrl(
      {
        q: trimmed,
        filters: currentFilters,
        like: currentPhoto?.productId ?? null,
      },
      history,
    );
    const run = ++latest.current;
    // Spanish queries are rewritten in English with the glossary (ADR 0011).
    const { text: english, translated } = translateQuery(trimmed);
    setStatus({ kind: "searching" });
    try {
      const encodeStart = performance.now();
      const parts = await Promise.all([
        currentPhoto
          ? photoVector(currentPhoto).then((vector) => ({ vector, weight: 1 }))
          : null,
        trimmed
          ? encodeText(english).then((vector) => ({
              vector,
              weight: currentPhoto ? COMBINED_TEXT_WEIGHT : 1,
            }))
          : null,
      ]);
      const [photoPart, textPart] = parts;
      // Keyword vector for hybrid search: token hashes, not the text itself.
      // Text-only searches use it; with a photo, a refinement like "in blue"
      // would match thousands of unrelated blue products (ADR 0009).
      const keywords = english && !currentPhoto ? queryKeywords(english) : null;
      const vector = combine(parts.filter((part) => part !== null));
      const encodeMs = performance.now() - encodeStart;
      const searchStart = performance.now();
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vector: Array.from(vector),
          filters: currentFilters,
          limit: 36,
          // Text searches also ask for the unfused lists, for compare mode.
          ...(keywords ? { keywords, compare: true } : {}),
          // A combined query also sends its parts, to score each result
          // against the photo and the text separately.
          ...(photoPart && textPart
            ? {
                parts: [
                  { name: "photo", vector: Array.from(photoPart.vector) },
                  { name: "text", vector: Array.from(textPart.vector) },
                ],
              }
            : {}),
        }),
      });
      const body = (await response.json()) as SearchResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Search failed.");
      if (run !== latest.current) return;
      const searchMs = performance.now() - searchStart;
      const description = [currentPhoto?.label, trimmed && `“${trimmed}”`]
        .filter(Boolean)
        .join(" + ");
      const scope = Object.values(currentFilters).filter(Boolean).join(", ");
      setStatus({
        kind: "done",
        description: scope ? `${description} in ${scope}` : description,
        results: body.results,
        lists: body.lists,
      });
      const encoders = [
        ...(currentPhoto ? (["image"] as const) : []),
        ...(trimmed ? (["text"] as const) : []),
      ];
      const firstRun = encoders.some((e) => !usedEncoders.current.has(e));
      encoders.forEach((e) => usedEncoders.current.add(e));
      setTrace({
        query: description,
        encoders,
        encodeMs,
        firstRun,
        vector,
        keywords: keywords ? [...new Set(tokenize(english))] : [],
        readAs: translated ? english : null,
        searchMs,
        results: body.results.length,
        keywordHits: body.results.filter((r) => r.signals?.includes("keywords"))
          .length,
      });
    } catch (error) {
      if (run === latest.current) {
        setStatus({
          kind: "error",
          message: error instanceof Error ? error.message : "Search failed.",
        });
      }
    }
  }

  function selectPhoto(blob: Blob, label: string) {
    if (!blob.type.startsWith("image/")) {
      setStatus({
        kind: "error",
        message: "That file is not an image. Use a JPEG, PNG or WebP photo.",
      });
      return;
    }
    if (blob.size > MAX_PHOTO_BYTES) {
      setStatus({
        kind: "error",
        message: "That photo is larger than 10 MB. Use a smaller one.",
      });
      return;
    }
    const next = { blob, label };
    setPhoto(next);
    void search(query, next);
  }

  function removePhoto() {
    setPhoto(null);
    textInput.current?.focus();
    if (query.trim()) void search(query, null);
    else {
      setStatus({ kind: "idle" });
      writeUrl({ q: "", filters, like: null }, "push");
    }
  }

  /** Downloads a catalog product's photo to search with it. */
  async function productPhoto(
    id: number,
    label: string,
  ): Promise<Photo | null> {
    try {
      const response = await fetch(`${IMAGE_BASE_URL}/${id}`);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      return { blob, label, productId: id };
    } catch {
      setStatus({
        kind: "error",
        message: "That product's photo is not available.",
      });
      return null;
    }
  }

  async function moreLikeThis(result: SearchResult) {
    const next = await productPhoto(result.id, `“${result.product.name}”`);
    if (!next) return;
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setPhoto(next);
    void search("", next);
  }

  /** Shows the search described by a URL: on load and on back/forward. */
  const restore = useEffectEvent(async (state: SearchState) => {
    setQuery(state.q);
    setFilters(state.filters);
    const next =
      state.like === null
        ? null
        : await productPhoto(state.like, `product ${state.like}`);
    if (state.like !== null && !next) return;
    setPhoto(next);
    if (state.q || next) void search(state.q, next, state.filters, "none");
    else {
      latest.current++;
      setStatus({ kind: "idle" });
    }
  });

  useEffect(() => {
    const fromUrl = () =>
      void restore(
        parseSearchState(new URLSearchParams(window.location.search)),
      );
    if (window.location.search) fromUrl();
    window.addEventListener("popstate", fromUrl);
    return () => window.removeEventListener("popstate", fromUrl);
  }, []);

  // Drop or paste a photo anywhere on the page.
  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      event.dataTransfer?.types.includes("Files") ?? false;
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) selectPhoto(file, "your photo");
    };
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((f) =>
        f.type.startsWith("image/"),
      );
      if (!file) return;
      event.preventDefault();
      selectPhoto(file, "your photo");
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  });

  function changeFilters(next: SearchFilters) {
    setFilters(next);
    if (query.trim() || photo) void search(query, photo, next);
    else writeUrl({ q: "", filters: next, like: null }, "replace");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void search(query, photo);
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) selectPhoto(file, "your photo");
  }

  const placeholder = photo
    ? "Describe a change, e.g. in blue"
    : "Describe a product, e.g. a red dress";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-6 lg:grid-cols-[12rem_minmax(0,1fr)_17rem] lg:grid-rows-[auto_1fr] xl:grid-cols-[13rem_minmax(0,1fr)_19rem]">
      <section
        aria-label="Search the catalog"
        className="lg:col-start-2 lg:row-start-1"
      >
        <form
          onSubmit={onSubmit}
          role="search"
          className="flex h-11 items-center gap-1 rounded-md border border-rule bg-paper pr-1 transition-colors focus-within:border-muted"
        >
          {photo && <PhotoChip photo={photo} onRemove={removePhoto} />}
          <input
            ref={textInput}
            className="h-full min-w-0 flex-1 bg-transparent px-3 placeholder:text-muted/70 focus-visible:outline-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={warmUpTextModel}
            placeholder={placeholder}
            aria-label={
              photo
                ? "Describe how it should differ from the photo"
                : "Describe what you are looking for"
            }
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          <button
            type="button"
            className="shrink-0 px-2 text-sm text-muted hover:text-ink"
            onClick={() => fileInput.current?.click()}
          >
            <span className="sm:hidden">Photo</span>
            <span className="hidden sm:inline">
              {photo ? "Use another photo" : "Search with a photo"}
            </span>
          </button>
          <button
            type="submit"
            className="shrink-0 rounded bg-ink px-3 py-1.5 text-sm text-paper hover:opacity-85"
          >
            Search
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            onChange={onFileChosen}
          />
        </form>

        <div className="mt-3 min-h-6 text-sm text-muted">
          {status.kind === "idle" ? (
            <p>
              Try{" "}
              {SUGGESTIONS.map((suggestion, index) => (
                <span key={suggestion}>
                  <button
                    type="button"
                    className="link hover:text-ink"
                    onClick={() => {
                      setQuery(suggestion);
                      void search(suggestion, photo);
                    }}
                  >
                    {suggestion}
                  </button>
                  {index < SUGGESTIONS.length - 1 ? ", " : ""}
                </span>
              ))}
              , or drop a photo anywhere.
            </p>
          ) : status.kind === "searching" ? (
            <p aria-live="polite">Searching…</p>
          ) : status.kind === "done" ? (
            <p aria-live="polite">
              {status.results.length} closest matches for {status.description}
            </p>
          ) : (
            <p role="alert" className="text-ink">
              {status.message}
            </p>
          )}
        </div>
      </section>

      <aside
        aria-label="Filters"
        className="lg:sticky lg:top-8 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start"
      >
        {facets && (
          <Filters facets={facets} filters={filters} onChange={changeFilters} />
        )}
      </aside>

      <div className="lg:col-start-2 lg:row-start-2">
        {status.kind === "done" && status.lists && (
          <div
            role="tablist"
            aria-label="Results view"
            className="mb-5 flex gap-4 border-b border-rule text-sm"
          >
            {(
              [
                ["results", "Results"],
                ["compare", "Compare image, keywords and hybrid"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                className={`-mb-px border-b py-2 ${view === id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {status.kind === "done" &&
          (view === "compare" && status.lists ? (
            <CompareView lists={status.lists} results={status.results} />
          ) : (
            <ResultsGrid
              results={status.results}
              onMoreLikeThis={moreLikeThis}
            />
          ))}
      </div>

      {/* Fits the viewport below the page header, so nothing in it scrolls. */}
      <aside className="flex flex-col gap-6 lg:sticky lg:top-8 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:h-[calc(100dvh-12rem)] lg:min-h-[34rem] lg:self-start">
        <Pipeline
          trace={trace}
          progress={progress}
          matching={facets ? matchingCount(facets, filters) : null}
        />
        <EmbeddingMapView
          results={status.kind === "done" ? status.results : null}
          onExpand={() => setMapOpen(true)}
        />
        <ExpandedMap
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          results={status.kind === "done" ? status.results : null}
          query={query}
          status={
            status.kind === "done"
              ? `${status.results.length} closest matches for ${status.description}`
              : status.kind === "searching"
                ? "Searching…"
                : status.kind === "error"
                  ? status.message
                  : "Search to see where your query lands."
          }
          onSearch={(text) => {
            setQuery(text);
            void search(text, photo);
          }}
        />
      </aside>

      {dragging && (
        <div className="pointer-events-none fixed inset-4 z-10 flex items-center justify-center rounded-lg border border-dashed border-muted bg-paper/90">
          Drop a photo to search with it
        </div>
      )}
    </div>
  );
}

/**
 * Products matching the current filters. Each facet is counted with every
 * other filter applied, so the gender facet (every product has one) gives
 * the total, narrowed to the selected gender if there is one.
 */
function matchingCount(facets: Facets, filters: SearchFilters): number {
  return facets.gender
    .filter(({ value }) => !filters.gender || value === filters.gender)
    .reduce((sum, { count }) => sum + count, 0);
}
