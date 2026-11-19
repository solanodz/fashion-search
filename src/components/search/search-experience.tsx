"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
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
import type {
  SearchFilters,
  SearchResponse,
  SearchResult,
} from "@/lib/search/schema";

import { Filters } from "./filters";

import { PhotoChip } from "./photo-chip";
import { IMAGE_BASE_URL, ResultsGrid } from "./results-grid";

const SUGGESTIONS = [
  "white running shoes",
  "a black leather handbag",
  "gold earrings",
  "men's blue jeans",
];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export type Photo = { blob: Blob; url: string; label: string };

type Status =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "done"; description: string; results: SearchResult[] }
  | { kind: "error"; message: string };

export function SearchExperience() {
  const [query, setQuery] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const [dragging, setDragging] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [facets, setFacets] = useState<Facets | null>(null);
  const latest = useRef(0);
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

  // Free the previous preview URL when the photo changes or the page unmounts.
  useEffect(
    () => () => (photo ? URL.revokeObjectURL(photo.url) : undefined),
    [photo],
  );

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
  ) {
    const trimmed = text.trim();
    if (!trimmed && !currentPhoto) return;
    const run = ++latest.current;
    setStatus({ kind: "searching" });
    try {
      const parts = await Promise.all([
        currentPhoto
          ? photoVector(currentPhoto).then((vector) => ({ vector, weight: 1 }))
          : null,
        trimmed
          ? encodeText(trimmed).then((vector) => ({
              vector,
              weight: currentPhoto ? COMBINED_TEXT_WEIGHT : 1,
            }))
          : null,
      ]);
      const vector = combine(parts.filter((part) => part !== null));
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vector: Array.from(vector),
          filters: currentFilters,
          limit: 36,
        }),
      });
      const body = (await response.json()) as SearchResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Search failed.");
      if (run !== latest.current) return;
      const description = [currentPhoto?.label, trimmed && `“${trimmed}”`]
        .filter(Boolean)
        .join(" + ");
      const scope = Object.values(currentFilters).filter(Boolean).join(", ");
      setStatus({
        kind: "done",
        description: scope ? `${description} in ${scope}` : description,
        results: body.results,
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
    const next = { blob, url: URL.createObjectURL(blob), label };
    setPhoto(next);
    void search(query, next);
  }

  function removePhoto() {
    setPhoto(null);
    textInput.current?.focus();
    if (query.trim()) void search(query, null);
    else setStatus({ kind: "idle" });
  }

  async function moreLikeThis(result: SearchResult) {
    let blob: Blob;
    try {
      const response = await fetch(`${IMAGE_BASE_URL}/${result.id}`);
      if (!response.ok) throw new Error(String(response.status));
      blob = await response.blob();
    } catch {
      setStatus({
        kind: "error",
        message: "That product's photo is not available.",
      });
      return;
    }
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    const next = {
      blob,
      url: URL.createObjectURL(blob),
      label: `“${result.product.name}”`,
    };
    setPhoto(next);
    void search("", next);
  }

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

  const downloading = progress && progress.loaded < progress.total;
  const placeholder = photo ? "in blue" : "a red dress";

  return (
    <section aria-label="Search the catalog">
      <form onSubmit={onSubmit} role="search">
        <label className="search-sentence block text-[clamp(2.6rem,7.5vw,6.5rem)] leading-[0.95] font-bold tracking-[-0.035em]">
          <span>Show me </span>
          {photo && <PhotoChip photo={photo} onRemove={removePhoto} />}
          <input
            ref={textInput}
            className="search-input min-w-[4ch] border-indigo bg-transparent text-indigo caret-indigo placeholder:text-rule"
            style={
              {
                "--chars": (query || placeholder).length + (photo ? 2 : 0),
              } as React.CSSProperties
            }
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
        </label>
      </form>

      <div className="mt-6 flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2 text-base text-graphite">
        <button
          type="button"
          className="font-medium text-indigo underline decoration-2 underline-offset-4 hover:decoration-4"
          onClick={() => fileInput.current?.click()}
        >
          {photo ? "Use another photo" : "Search with a photo"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={onFileChosen}
        />

        {downloading ? (
          <ModelDownload progress={progress} />
        ) : status.kind === "idle" ? (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="rounded-full border border-rule px-3 py-1 transition-colors hover:border-indigo hover:text-indigo"
                onClick={() => {
                  setQuery(suggestion);
                  void search(suggestion, photo);
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
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

      {facets && (
        <Filters facets={facets} filters={filters} onChange={changeFilters} />
      )}

      {status.kind === "done" && (
        <ResultsGrid results={status.results} onMoreLikeThis={moreLikeThis} />
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-10 flex items-center justify-center rounded-lg border-4 border-dashed border-indigo bg-lining/90 text-3xl font-bold text-indigo">
          Drop a photo to search with it
        </div>
      )}
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
