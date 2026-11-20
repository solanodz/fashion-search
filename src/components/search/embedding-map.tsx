"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  CATEGORY_COLOURS,
  decodeMap,
  type EmbeddingMap,
  MAP_FILES,
  type MapMeta,
  OTHER_COLOUR,
  placeQuery,
} from "@/lib/indexing/embedding-map";
import type { SearchResult } from "@/lib/search/schema";

import { IMAGE_BASE_URL } from "./results-grid";

/**
 * Every product's image vector projected to 2D (UMAP, ADR 0010), with the
 * current results and the query drawn on top. Similar products sit close
 * together, which is what the search relies on. The sidebar shows a compact
 * map; "Expand" opens a large one with zoom, pan and its own search box.
 */

const PAD = 6;
/** Results joined to the query by a line in the expanded map. */
const LINKED_RESULTS = 10;

let mapRequest: Promise<EmbeddingMap> | null = null;

/** Loads the map files once per page, shared by every map on it. */
function loadMap(): Promise<EmbeddingMap> {
  mapRequest ??= Promise.all([
    fetch(`/${MAP_FILES.meta}`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<MapMeta>;
    }),
    fetch(`/${MAP_FILES.points}`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    }),
  ]).then(([meta, bytes]) => decodeMap(bytes, meta));
  mapRequest.catch(() => {
    mapRequest = null;
  });
  return mapRequest;
}

function useEmbeddingMap() {
  const [map, setMap] = useState<EmbeddingMap | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadMap()
      .then((loaded) => !cancelled && setMap(loaded))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);
  return { map, failed };
}

type View = { k: number; x: number; y: number };
const IDENTITY: View = { k: 1, x: 0, y: 0 };
type Hover = { left: number; top: number; text: string } | null;

/**
 * The map itself: a square canvas as large as its container allows. With
 * `detailed`, it labels more types, joins the query to its closest results
 * and can be zoomed (wheel) and dragged.
 */
function MapCanvas({
  map,
  results,
  detailed = false,
}: {
  map: EmbeddingMap;
  results: SearchResult[] | null;
  detailed?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState(0);
  /** Horizontal offset of the centred canvas inside its frame. */
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<View>(IDENTITY);
  const [hover, setHover] = useState<Hover>(null);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const fit = (width: number, height: number) => {
      const side = Math.max(0, Math.floor(Math.min(width, height)));
      setSize(side);
      setOffset(detailed ? (width - side) / 2 : 0);
    };
    if (typeof ResizeObserver === "undefined") {
      fit(element.clientWidth, element.clientHeight || element.clientWidth);
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      fit(entry.contentRect.width, entry.contentRect.height),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [detailed]);

  const index = useMemo(() => {
    const byId = new Map<number, number>();
    map.ids.forEach((id, i) => byId.set(id, i));
    return byId;
  }, [map]);

  // Label the largest article types at the median of their points.
  const labels = useMemo(() => {
    const byType = new Map<number, { xs: number[]; ys: number[] }>();
    map.types.forEach((type, i) => {
      const entry = byType.get(type) ?? { xs: [], ys: [] };
      entry.xs.push(map.xy[i * 2]);
      entry.ys.push(map.xy[i * 2 + 1]);
      byType.set(type, entry);
    });
    const median = (values: number[]) =>
      values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    return [...byType]
      .sort(([, a], [, b]) => b.xs.length - a.xs.length)
      .slice(0, detailed ? 24 : 8)
      .map(([type, { xs, ys }]) => ({
        text: map.meta.types[type],
        x: median(xs),
        y: median(ys),
      }));
  }, [map, detailed]);

  const highlighted = useMemo(() => {
    if (!results) return { points: [], query: null };
    const points = results.flatMap((result) => {
      const i = index.get(result.id);
      return i === undefined
        ? []
        : [{ x: map.xy[i * 2], y: map.xy[i * 2 + 1], result }];
    });
    const query = placeQuery(
      points.map((p) => ({ x: p.x, y: p.y, score: p.result.score })),
    );
    return { points, query };
  }, [map, results, index]);

  // Map coordinates ([0, 1]) to canvas pixels, through the zoom and pan.
  const inner = size - PAD * 2;
  const toScreen = (x: number, y: number): [number, number] => [
    (PAD + x * inner) * view.k + view.x,
    (PAD + y * inner) * view.k + view.y,
  ];
  const toMap = (sx: number, sy: number): [number, number] => [
    ((sx - view.x) / view.k - PAD) / inner,
    ((sy - view.y) / view.k - PAD) / inner,
  ];

  useEffect(() => {
    const element = canvas.current;
    if (!element || size === 0) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = size * ratio;
    element.height = size * ratio;
    const context = element.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, size, size);
    const ink =
      getComputedStyle(element).getPropertyValue("--ink").trim() || "#21201c";
    const at = (x: number, y: number) => [
      (PAD + x * inner) * view.k + view.x,
      (PAD + y * inner) * view.k + view.y,
    ];
    const dot = 1.5 * Math.sqrt(Math.min(view.k, 6));

    const hasResults = highlighted.points.length > 0;
    context.globalAlpha = hasResults ? 0.25 : 0.5;
    for (let i = 0; i < map.ids.length; i++) {
      const type = map.meta.types[map.types[i]];
      context.fillStyle =
        CATEGORY_COLOURS[map.meta.categories[type]] ?? OTHER_COLOUR;
      const [x, y] = at(map.xy[i * 2], map.xy[i * 2 + 1]);
      if (x < -4 || y < -4 || x > size + 4 || y > size + 4) continue;
      context.fillRect(x - dot / 2, y - dot / 2, dot, dot);
    }

    context.globalAlpha = hasResults ? (detailed ? 0.55 : 0) : 1;
    context.font = `${detailed ? 11 : 10}px var(--font-geist), sans-serif`;
    context.textAlign = "center";
    context.fillStyle = ink;
    if (context.globalAlpha > 0) {
      for (const label of labels) {
        const [x, y] = at(label.x, label.y);
        context.fillText(label.text, x, y);
      }
    }

    context.globalAlpha = 1;
    const query = highlighted.query
      ? at(highlighted.query.x, highlighted.query.y)
      : null;
    if (detailed && query) {
      // The query's closest products, joined to it.
      context.strokeStyle = ink;
      context.globalAlpha = 0.35;
      context.lineWidth = 1;
      for (const point of highlighted.points.slice(0, LINKED_RESULTS)) {
        const [x, y] = at(point.x, point.y);
        context.beginPath();
        context.moveTo(query[0], query[1]);
        context.lineTo(x, y);
        context.stroke();
      }
      context.globalAlpha = 1;
    }
    context.fillStyle = ink;
    for (const point of highlighted.points) {
      const [x, y] = at(point.x, point.y);
      context.beginPath();
      context.arc(x, y, detailed ? 3 : 2.2, 0, Math.PI * 2);
      context.fill();
    }
    if (query) {
      context.strokeStyle = ink;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(query[0], query[1], detailed ? 9 : 7, 0, Math.PI * 2);
      context.stroke();
    }
  }, [map, size, inner, labels, highlighted, view, detailed]);

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    if (drag.current) {
      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      drag.current = { x: event.clientX, y: event.clientY };
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      setHover(null);
      return;
    }
    const [px, py] = toMap(sx, sy);
    const reach = 7 / (inner * view.k);
    let best: Hover = null;
    let bestDistance = reach * reach;
    // Results first: they're what the visitor is looking at.
    for (const point of highlighted.points) {
      const d = (point.x - px) ** 2 + (point.y - py) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        const [left, top] = toScreen(point.x, point.y);
        best = {
          left,
          top,
          text: `${point.result.product.name}, ${point.result.score.toFixed(3)}`,
        };
      }
    }
    if (!best) {
      for (let i = 0; i < map.ids.length; i++) {
        const x = map.xy[i * 2];
        const y = map.xy[i * 2 + 1];
        const d = (x - px) ** 2 + (y - py) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          const [left, top] = toScreen(x, y);
          best = { left, top, text: map.meta.types[map.types[i]] };
        }
      }
    }
    setHover(best);
  }

  function onWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    if (!detailed) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    setView((v) => {
      const k = Math.min(
        24,
        Math.max(1, v.k * Math.exp(-event.deltaY * 0.0015)),
      );
      if (k === 1) return IDENTITY;
      return {
        k,
        x: cx - (cx - v.x) * (k / v.k),
        y: cy - (cy - v.y) * (k / v.k),
      };
    });
  }

  // Wheel zoom must not scroll the page behind the expanded map.
  useEffect(() => {
    const element = canvas.current;
    if (!element || !detailed) return;
    const stop = (event: WheelEvent) => event.preventDefault();
    element.addEventListener("wheel", stop, { passive: false });
    return () => element.removeEventListener("wheel", stop);
  }, [detailed]);

  const description =
    `Map of ${map.ids.length.toLocaleString("en")} products by image similarity` +
    (highlighted.points.length
      ? `, with the query and its ${highlighted.points.length} results highlighted`
      : "");

  return (
    <div ref={frame} className="relative h-full min-h-0 w-full">
      <canvas
        ref={canvas}
        role="img"
        aria-label={description}
        style={{ width: size, height: size }}
        className={`block rounded-sm border border-rule ${detailed ? "mx-auto cursor-grab touch-none active:cursor-grabbing" : ""}`}
        onPointerDown={(event) => {
          if (!detailed) return;
          drag.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onWheel={onWheel}
        onDoubleClick={() => detailed && setView(IDENTITY)}
      />
      {hover && (
        <span
          className="pointer-events-none absolute z-10 max-w-56 -translate-x-1/2 -translate-y-full rounded-sm bg-ink px-2 py-1 text-xs text-paper"
          style={{
            left: hover.left + offset,
            top: hover.top - 8,
          }}
        >
          {hover.text}
        </span>
      )}
      {detailed && view.k > 1 && (
        <button
          type="button"
          className="absolute top-2 right-2 rounded-sm border border-rule bg-paper px-2 py-1 text-xs text-muted hover:text-ink"
          onClick={() => setView(IDENTITY)}
        >
          Reset zoom
        </button>
      )}
    </div>
  );
}

function Legend() {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {[...Object.entries(CATEGORY_COLOURS), ["Other", OTHER_COLOUR]].map(
        ([name, colour]) => (
          <span key={name} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: colour }}
            />
            {name}
          </span>
        ),
      )}
    </span>
  );
}

/** The compact map in the sidebar, filling the space left below the pipeline. */
export function EmbeddingMapView({
  results,
  onExpand,
}: {
  results: SearchResult[] | null;
  onExpand: () => void;
}) {
  const { map, failed } = useEmbeddingMap();
  return (
    <section
      aria-labelledby="map-title"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="map-title" className="font-medium">
          Embedding space
        </h2>
        <button
          type="button"
          className="link text-sm text-muted hover:text-ink"
          onClick={onExpand}
        >
          Expand
        </button>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {results?.length
          ? "Your query (ring) and its results (dots)"
          : "Every product, placed by image similarity"}
      </p>
      <div className="mt-2 aspect-square w-full lg:aspect-auto lg:min-h-24 lg:flex-1">
        {failed ? (
          <p className="text-sm text-muted">The map is not available.</p>
        ) : map ? (
          <MapCanvas map={map} results={results} />
        ) : null}
      </div>
    </section>
  );
}

/**
 * The map in a large dialog, with a search box, so a visitor can search and
 * watch where the query lands and which products are its neighbours.
 */
export function ExpandedMap({
  open,
  onClose,
  results,
  query,
  status,
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  results: SearchResult[] | null;
  query: string;
  status: string;
  onSearch: (text: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { map, failed } = useEmbeddingMap();
  const [text, setText] = useState(query);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setText(query);
      element.showModal();
    } else if (!open && element.open) element.close();
  }, [open, query]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (text.trim()) onSearch(text);
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="expanded-map-title"
      onClose={onClose}
      className="m-auto h-[min(92dvh,56rem)] w-[min(96vw,80rem)] max-w-none rounded-md border border-rule bg-paper p-0 text-ink backdrop:bg-black/50"
    >
      {/* Content only while open: no hidden duplicate map or status text. */}
      {open && (
        <div className="flex h-full flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="expanded-map-title" className="text-lg font-medium">
              Embedding space
            </h2>
            <button
              type="button"
              className="link text-sm text-muted hover:text-ink"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <form
            role="search"
            onSubmit={submit}
            className="flex h-10 max-w-xl items-center gap-1 rounded-md border border-rule pr-1 focus-within:border-muted"
          >
            <input
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm placeholder:text-muted/70 focus-visible:outline-none"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Search, e.g. a red dress, then watch where it lands"
              aria-label="Search and show the results on the map"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="rounded bg-ink px-3 py-1.5 text-sm text-paper hover:opacity-85"
            >
              Search
            </button>
          </form>
          <div className="grid min-h-0 flex-1 gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-h-64">
              {failed ? (
                <p className="text-sm text-muted">The map is not available.</p>
              ) : map ? (
                <MapCanvas map={map} results={results} detailed />
              ) : null}
            </div>
            <aside className="flex min-h-0 flex-col gap-4 overflow-hidden text-sm">
              <p className="text-muted" aria-live="polite">
                {status}
              </p>
              <p className="leading-relaxed text-muted">
                Each dot is a product photo, placed so that similar photos sit
                close together. Your query lands at the ring, among the products
                it matches best; lines join it to its {LINKED_RESULTS} closest
                results. Scroll to zoom, drag to move, double-click to reset.
              </p>
              <Legend />
              {results && results.length > 0 && (
                <ol className="grid min-h-0 grid-cols-3 gap-2 overflow-hidden">
                  {results.slice(0, 9).map((result, i) => (
                    <li key={result.id} className="text-[10px] tabular-nums">
                      <span className="isolate flex aspect-[3/4] rounded-sm bg-tile">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`${IMAGE_BASE_URL}/${result.id}`}
                          alt={result.product.name}
                          loading="lazy"
                          className="h-full w-full object-contain mix-blend-multiply"
                        />
                      </span>
                      <span className="mt-0.5 block">
                        <span className="text-muted">{i + 1}</span>{" "}
                        {result.score.toFixed(3)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </aside>
          </div>
        </div>
      )}
    </dialog>
  );
}
