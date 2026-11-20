"use client";

import { useEffect, useRef, useState } from "react";

import {
  encodeText,
  findGarments,
  type FoundGarment,
  type ModelProgress,
  onModelProgress,
} from "@/lib/clip/client";
import { IMAGE_BASE_URL } from "@/lib/images";
import type { OutfitDescription } from "@/lib/outfit/describe";
import { GARMENTS } from "@/lib/outfit/garments";
import { blend, type GarmentQuery, planQueries } from "@/lib/outfit/query";
import { queryKeywords } from "@/lib/search/keywords";
import type { SearchResponse, SearchResult } from "@/lib/search/schema";

/**
 * Upload a photo of a person; every garment in it is found, cropped and
 * searched in its own part of the catalog (ADR 0013). Segmentation and CLIP
 * run in the browser. When "Describe with AI" is on, the photo (downscaled)
 * is also sent to a small vision language model that names each garment in
 * catalog words; the description joins each garment's query as text.
 */

/** Catalog photos of people wearing a full outfit, to try without a photo. */
const SAMPLES = [
  { id: 57068, label: "jacket and jeans" },
  { id: 58560, label: "jeans and belt" },
  { id: 53252, label: "shirt and jeans" },
  { id: 57050, label: "dress" },
];

const GENDERS = ["Any", "Women", "Men"] as const;
type Gender = (typeof GENDERS)[number];

const RESULTS_PER_GARMENT = 6;

/** Longest side of the photo sent for a description ("low" detail is 512). */
const DESCRIBE_SIZE = 512;

/** Milliseconds, for the timings shown after a search. */
const now = () => performance.now();

type Match = {
  query: GarmentQuery;
  garment: FoundGarment | null;
  results: SearchResult[];
};

/** Why there is no description: off, not set up on the server, or failed. */
type DescribeState = "off" | "used" | "unavailable" | "failed";

type Analysis = {
  garments: FoundGarment[];
  description: OutfitDescription | null;
  describe: DescribeState;
};

type Status =
  | { kind: "idle" }
  | { kind: "working"; step: "finding" | "searching" }
  | {
      kind: "done";
      matches: Match[];
      describe: DescribeState;
      ms: { find: number; search: number };
    }
  | { kind: "error"; message: string };

const garmentName = (key: string) =>
  GARMENTS.find((g) => g.key === key)?.name ?? key;

/** The photo shrunk to fit DESCRIBE_SIZE, as a JPEG data: URL. */
async function photoDataUrl(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(
    1,
    DESCRIBE_SIZE / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = new OffscreenCanvas(
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale),
  );
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const jpeg = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: 0.85,
  });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(jpeg);
  });
}

/** The outfit's description, or why there is none. */
async function describeOutfit(
  blob: Blob,
): Promise<{ description: OutfitDescription | null; state: DescribeState }> {
  try {
    const response = await fetch("/api/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: await photoDataUrl(blob) }),
    });
    if (response.status === 501)
      return { description: null, state: "unavailable" };
    if (!response.ok) return { description: null, state: "failed" };
    return {
      description: (await response.json()) as OutfitDescription,
      state: "used",
    };
  } catch {
    return { description: null, state: "failed" };
  }
}

export function OutfitExperience() {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [gender, setGender] = useState<Gender>("Any");
  const [useAi, setUseAi] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const latest = useRef(0);
  const analysis = useRef<Analysis | null>(null);

  useEffect(() => onModelProgress(setProgress), []);

  async function searchGarments(
    { garments, description }: Analysis,
    forGender: Gender,
  ): Promise<Match[]> {
    const queries = planQueries(garments, description, forGender);
    return Promise.all(
      queries.map(async (query) => {
        const garment = query.found === null ? null : garments[query.found];
        const text = await encodeText(`a photo of a ${query.text}`);
        // Keywords use the catalog's words for the type too ("Jackets").
        const keywords = queryKeywords(
          [query.text, query.filters.articleType].filter(Boolean).join(" "),
        );
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vector: Array.from(blend(garment?.vector ?? null, text)),
            filters: query.filters,
            limit: RESULTS_PER_GARMENT,
            ...(keywords ? { keywords } : {}),
          }),
        });
        const body = (await response.json()) as SearchResponse & {
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "Search failed.");
        return { query, garment, results: body.results };
      }),
    );
  }

  async function run(
    blob: Blob,
    options: { gender: Gender; ai: boolean; reuse?: boolean },
  ) {
    const id = ++latest.current;
    try {
      let findMs = 0;
      const cached = analysis.current;
      const reusable =
        options.reuse &&
        cached &&
        (options.ai ? cached.describe !== "off" : cached.describe === "off");
      if (!reusable) {
        setStatus({ kind: "working", step: "finding" });
        const start = now();
        const [garments, described] = await Promise.all([
          findGarments(blob),
          options.ai
            ? describeOutfit(blob)
            : Promise.resolve({ description: null, state: "off" as const }),
        ]);
        findMs = now() - start;
        if (id !== latest.current) return;
        analysis.current = {
          garments,
          description: described.description,
          describe: described.state,
        };
      }
      const current = analysis.current!;
      if (
        current.garments.length === 0 &&
        !current.description?.garments.length
      ) {
        setStatus({
          kind: "error",
          message:
            "No clothes found in this photo. Try one where a person is in full view.",
        });
        return;
      }
      setStatus({ kind: "working", step: "searching" });
      const start = now();
      const matches = await searchGarments(current, options.gender);
      if (id !== latest.current) return;
      setStatus({
        kind: "done",
        matches,
        describe: current.describe,
        ms: { find: findMs, search: now() - start },
      });
    } catch (error) {
      if (id !== latest.current) return;
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function choose(blob: Blob) {
    setPhoto(blob);
    analysis.current = null;
    void run(blob, { gender, ai: useAi });
  }

  async function chooseSample(sampleId: number) {
    try {
      const response = await fetch(`${IMAGE_BASE_URL}/${sampleId}`);
      if (!response.ok) throw new Error(String(response.status));
      choose(await response.blob());
    } catch {
      setStatus({ kind: "error", message: "Couldn't load that photo." });
    }
  }

  function changeGender(next: Gender) {
    setGender(next);
    if (photo) void run(photo, { gender: next, ai: useAi, reuse: true });
  }

  function changeAi(next: boolean) {
    setUseAi(next);
    if (photo) void run(photo, { gender, ai: next, reuse: true });
  }

  const working = status.kind === "working";
  const downloading =
    working &&
    progress &&
    progress.total > 0 &&
    progress.loaded < progress.total;

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-8 lg:self-start">
        <PhotoView
          photo={photo}
          boxes={
            status.kind === "done"
              ? status.matches.flatMap((m) => (m.garment ? [m.garment] : []))
              : []
          }
          highlight={highlight}
          onPick={() => fileInput.current?.click()}
          onDrop={choose}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-label="Photo of a person"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) choose(file);
            event.target.value = "";
          }}
        />
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            className="link text-muted hover:text-ink"
            onClick={() => fileInput.current?.click()}
          >
            {photo ? "Use another photo" : "Choose a photo"}
          </button>
          <div role="group" aria-label="Shop for" className="flex gap-1">
            {GENDERS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={gender === option}
                className={`rounded-sm px-2 py-0.5 text-xs ${gender === option ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
                onClick={() => changeGender(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Or try a catalog photo:{" "}
          {SAMPLES.map((sample, index) => (
            <span key={sample.id}>
              <button
                type="button"
                className="link hover:text-ink"
                onClick={() => void chooseSample(sample.id)}
              >
                {sample.label}
              </button>
              {index < SAMPLES.length - 1 ? ", " : "."}
            </span>
          ))}
        </p>
        <label className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted">
          <input
            type="checkbox"
            className="mt-0.5 accent-[var(--ink)]"
            checked={useAi}
            onChange={(event) => changeAi(event.target.checked)}
          />
          <span>
            <span className="text-ink">Describe with AI.</span> A small OpenAI
            model names each garment in catalog words, which sharpens colour and
            type. The photo is sent to OpenAI, downscaled, and not stored. Off,
            everything stays in this browser.
          </span>
        </label>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          A segmentation model finds each garment and CLIP encodes its crop in
          this browser; only vectors and words are sent to search.
        </p>
      </div>

      <section aria-label="Matches" aria-busy={working}>
        <div className="min-h-6 text-sm text-muted" aria-live="polite">
          {status.kind === "idle" && (
            <p>Each garment in the photo gets its own row of matches.</p>
          )}
          {working && (
            <p>
              {status.step === "finding"
                ? "Finding the garments in the photo…"
                : "Searching the catalog for each garment…"}
              {downloading &&
                ` Downloading models: ${Math.round((progress.loaded / progress.total) * 100)}% (first time only).`}
            </p>
          )}
          {status.kind === "error" && (
            <p className="text-ink">{status.message}</p>
          )}
          {status.kind === "done" && (
            <p className="tabular-nums">
              {status.matches.length}{" "}
              {status.matches.length === 1 ? "garment" : "garments"}
              {status.ms.find > 0 &&
                ` · found and encoded in ${Math.round(status.ms.find)} ms`}
              {` · searched in ${Math.round(status.ms.search)} ms`}
              {status.describe === "unavailable" &&
                " · AI descriptions aren't set up here, so CLIP read each garment"}
              {status.describe === "failed" &&
                " · the AI description failed, so CLIP read each garment"}
            </p>
          )}
        </div>

        {status.kind === "done" && (
          <ol className="mt-6 space-y-10">
            {status.matches.map(({ query, garment, results }) => (
              <li
                key={query.key}
                className="grid gap-x-6 gap-y-3 sm:grid-cols-[6rem_minmax(0,1fr)]"
                onMouseEnter={() => setHighlight(query.key)}
                onMouseLeave={() => setHighlight(null)}
                onFocus={() => setHighlight(query.key)}
                onBlur={() => setHighlight(null)}
              >
                <div className="flex gap-3 sm:block">
                  {garment ? (
                    <Cutout garment={garment} />
                  ) : (
                    <span className="flex aspect-[3/4] w-16 shrink-0 items-center justify-center rounded-sm border border-dashed border-rule px-1 text-center text-[10px] text-muted sm:w-full">
                      Described, not cropped
                    </span>
                  )}
                  <div className="sm:mt-2">
                    <h2 className="text-sm font-medium">
                      {garmentName(query.key)}
                    </h2>
                    <p className="text-xs leading-snug">{query.text}</p>
                    <p
                      className="mt-0.5 text-xs text-muted tabular-nums"
                      title={
                        query.source === "description"
                          ? "Described by the AI model"
                          : "Read off the crop by CLIP"
                      }
                    >
                      {query.source === "description" ? "AI" : "CLIP"}
                      {garment &&
                        ` · ${Math.max(1, Math.round(garment.share * 100))}% of the photo`}
                    </p>
                  </div>
                </div>
                {results.length === 0 ? (
                  <p className="text-sm text-muted">
                    Nothing like it
                    {gender === "Any" ? "" : ` for ${gender.toLowerCase()}`}.
                  </p>
                ) : (
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-3 gap-y-4">
                    {results.map((result) => (
                      <li key={result.id} className="text-xs">
                        <a
                          href={`/?like=${result.id}`}
                          className="group block"
                          title="Find more like this"
                        >
                          <span className="relative isolate flex aspect-[3/4] items-center justify-center overflow-hidden rounded-sm bg-tile">
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
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** The chosen photo, with a box around each garment found. */
function PhotoView({
  photo,
  boxes,
  highlight,
  onPick,
  onDrop,
}: {
  photo: Blob | null;
  boxes: FoundGarment[];
  highlight: string | null;
  onPick: () => void;
  onDrop: (blob: Blob) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(3 / 4);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !photo) return;
    let cancelled = false;
    createImageBitmap(photo)
      .then((bitmap) => {
        if (cancelled) return bitmap.close();
        element.width = bitmap.width;
        element.height = bitmap.height;
        element.getContext("2d")?.drawImage(bitmap, 0, 0);
        setAspect(bitmap.width / bitmap.height);
        bitmap.close();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photo]);

  return (
    <div
      className={`relative overflow-hidden rounded-sm bg-tile ${dragging ? "outline-2 outline-ink outline-dashed" : ""}`}
      style={{ aspectRatio: photo ? aspect : 3 / 4 }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file?.type.startsWith("image/")) onDrop(file);
      }}
    >
      {photo ? (
        <canvas
          ref={canvas}
          role="img"
          aria-label="Your photo"
          className="h-full w-full"
        />
      ) : (
        <button
          type="button"
          className="flex h-full w-full flex-col items-center justify-center gap-1 px-6 text-center text-sm text-muted hover:text-ink"
          onClick={onPick}
        >
          <span>Drop a photo of a person</span>
          <span className="text-xs">or click to choose one</span>
        </button>
      )}
      {boxes.map((garment) => {
        const active = highlight === garment.key;
        return (
          <span
            key={garment.key}
            aria-hidden
            className={`pointer-events-none absolute rounded-sm border transition-opacity motion-reduce:transition-none ${active ? "border-ink opacity-100" : "border-ink/60"} ${highlight && !active ? "opacity-0" : ""}`}
            style={{
              left: `${garment.box.x0 * 100}%`,
              top: `${garment.box.y0 * 100}%`,
              width: `${(garment.box.x1 - garment.box.x0) * 100}%`,
              height: `${(garment.box.y1 - garment.box.y0) * 100}%`,
            }}
          >
            <span className="absolute -top-px left-0 -translate-y-full rounded-t-sm bg-ink px-1 text-[10px] leading-4 text-paper">
              {garmentName(garment.key)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** A garment cut out on white, drawn from its pixels. */
function Cutout({ garment }: { garment: FoundGarment }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const { data, width, height } = garment.cutout;
    element.width = width;
    element.height = height;
    element
      .getContext("2d")
      ?.putImageData(
        new ImageData(new Uint8ClampedArray(data), width, height),
        0,
        0,
      );
  }, [garment]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={`${garmentName(garment.key)} cropped from the photo`}
      className="aspect-[3/4] w-16 shrink-0 rounded-sm border border-rule bg-white object-contain sm:w-full"
    />
  );
}
