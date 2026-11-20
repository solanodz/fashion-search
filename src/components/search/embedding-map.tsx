"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  CATEGORY_COLOURS,
  decodeMap,
  type EmbeddingMap,
  MAP_FILES,
  type MapMeta,
  OTHER_COLOUR,
  placeQuery,
  type Position,
} from "@/lib/indexing/embedding-map";
import type { SearchResult } from "@/lib/search/schema";

import { IMAGE_BASE_URL } from "./results-grid";

/**
 * Every product's image vector projected to 3D (UMAP, ADR 0010), drawn as a
 * point cloud in perspective, with the current results and the query on
 * top. Similar products sit close together, which is what the search relies
 * on. It turns slowly on its own until touched; drag to rotate. The sidebar
 * shows a compact view; "Expand" opens a large one with zoom and a search
 * box.
 */

/** Results joined to the query by a line in the expanded view. */
const LINKED_RESULTS = 10;
/** Camera distance from the cube's centre, in cube widths. */
const CAMERA = 2.4;
const AUTO_TURN = 0.0022;
const DEFAULT_VIEW = { yaw: -0.6, pitch: 0.35, zoom: 1 };
const CATEGORY_NAMES = Object.keys(CATEGORY_COLOURS);
/** Depth bands, far to near: dimmer and smaller further away. */
const BANDS = [
  { alpha: 0.18, size: 0.8 },
  { alpha: 0.32, size: 1 },
  { alpha: 0.55, size: 1.25 },
];

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

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeToReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

type View = { yaw: number; pitch: number; zoom: number };
type Hover = { left: number; top: number; text: string } | null;
type Highlight = Position & { result: SearchResult };

/**
 * The 3D view: a square canvas as large as its container allows, redrawn on
 * an animation frame while it turns or is dragged. With `detailed`, it
 * labels more types, joins the query to its closest results, and zooms
 * with the wheel.
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
  const view = useRef<View>({ ...DEFAULT_VIEW });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pointerInside = useRef(false);
  const touched = useRef(false);
  const dirty = useRef(true);
  /** Screen position of every point in the last frame, for hovering. */
  const screen = useRef<Float32Array>(new Float32Array(0));
  const [size, setSize] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hover, setHover] = useState<Hover>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const fit = (width: number, height: number) => {
      const side = Math.max(0, Math.floor(Math.min(width, height)));
      setSize(side);
      setOffset(detailed ? (width - side) / 2 : 0);
      dirty.current = true;
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

  // Per point: its category index, for one fill colour per batch.
  const categoryOf = useMemo(() => {
    const out = new Uint8Array(map.ids.length);
    map.types.forEach((type, i) => {
      const name = map.meta.categories[map.meta.types[type]];
      const index = CATEGORY_NAMES.indexOf(name);
      out[i] = index === -1 ? CATEGORY_NAMES.length : index;
    });
    return out;
  }, [map]);

  // Label the largest article types at the median of their points.
  const labels = useMemo(() => {
    const byType = new Map<number, number[][]>();
    map.types.forEach((type, i) => {
      const list = byType.get(type) ?? [];
      list.push([map.xyz[i * 3], map.xyz[i * 3 + 1], map.xyz[i * 3 + 2]]);
      byType.set(type, list);
    });
    const median = (values: number[]) =>
      values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    return [...byType]
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, detailed ? 20 : 8)
      .map(([type, points]) => ({
        text: map.meta.types[type],
        x: median(points.map((p) => p[0])),
        y: median(points.map((p) => p[1])),
        z: median(points.map((p) => p[2])),
      }));
  }, [map, detailed]);

  const highlighted = useMemo(() => {
    if (!results) return { points: [] as Highlight[], query: null };
    const index = new Map<number, number>();
    map.ids.forEach((id, i) => index.set(id, i));
    const points = results.flatMap((result): Highlight[] => {
      const i = index.get(result.id);
      return i === undefined
        ? []
        : [
            {
              x: map.xyz[i * 3],
              y: map.xyz[i * 3 + 1],
              z: map.xyz[i * 3 + 2],
              result,
            },
          ];
    });
    const query = placeQuery(
      points.map((p) => ({ x: p.x, y: p.y, z: p.z, score: p.result.score })),
    );
    return { points, query };
  }, [map, results]);

  useEffect(() => {
    dirty.current = true;
  }, [highlighted, labels, size]);

  // The render loop: redraws when something changed or while turning.
  useEffect(() => {
    const element = canvas.current;
    if (!element || size === 0) return;
    const context = element.getContext("2d");
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = size * ratio;
    element.height = size * ratio;
    const styles = getComputedStyle(element);
    const ink = styles.getPropertyValue("--ink").trim() || "#21201c";
    const line = styles.getPropertyValue("--line-strong").trim() || "#cfceca";
    const colours = [
      ...CATEGORY_NAMES.map((n) => CATEGORY_COLOURS[n]),
      OTHER_COLOUR,
    ];
    const count = map.ids.length;
    const groups = colours.length * BANDS.length;
    const keys = new Uint8Array(count);
    const order = new Uint32Array(count);
    const starts = new Uint32Array(groups + 1);
    const projected = new Float32Array(count * 2);
    screen.current = projected;

    let frameId = 0;
    const render = () => {
      frameId = requestAnimationFrame(render);
      const turning =
        !reducedMotion &&
        !drag.current &&
        !pointerInside.current &&
        !touched.current;
      if (turning) {
        view.current.yaw += AUTO_TURN;
        dirty.current = true;
      }
      if (!dirty.current) return;
      dirty.current = false;

      const { yaw, pitch, zoom } = view.current;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const half = size / 2;
      const scale = size * 0.5 * zoom;
      const project = (x: number, y: number, z: number) => {
        const px = x - 0.5;
        const py = 0.5 - y;
        const pz = z - 0.5;
        const x1 = px * cy - pz * sy;
        const z1 = px * sy + pz * cy;
        const y1 = py * cp - z1 * sp;
        const z2 = py * sp + z1 * cp;
        const f = CAMERA / (CAMERA + z2);
        return [half + x1 * scale * f, half - y1 * scale * f, z2, f] as const;
      };

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, size, size);

      // The unit cube's edges, as a depth cue.
      context.globalAlpha = 0.5;
      context.strokeStyle = line;
      context.lineWidth = 1;
      context.beginPath();
      const corners = [0, 1].flatMap((x) =>
        [0, 1].flatMap((y) => [0, 1].map((z) => project(x, y, z))),
      );
      for (let a = 0; a < 8; a++) {
        for (const bit of [1, 2, 4]) {
          const b = a | bit;
          if (b === a) continue;
          context.moveTo(corners[a][0], corners[a][1]);
          context.lineTo(corners[b][0], corners[b][1]);
        }
      }
      context.stroke();

      // Project every point and sort it into (depth band, colour) batches.
      starts.fill(0);
      for (let i = 0; i < count; i++) {
        const [x, y, z] = project(
          map.xyz[i * 3],
          map.xyz[i * 3 + 1],
          map.xyz[i * 3 + 2],
        );
        projected[i * 2] = x;
        projected[i * 2 + 1] = y;
        const band = z > 0.15 ? 0 : z > -0.15 ? 1 : 2;
        const key = band * colours.length + categoryOf[i];
        keys[i] = key;
        starts[key + 1]++;
      }
      for (let g = 0; g < groups; g++) starts[g + 1] += starts[g];
      const fill = starts.slice(0, groups);
      for (let i = 0; i < count; i++) order[fill[keys[i]]++] = i;

      const dimmed = highlighted.points.length > 0;
      const dot = Math.max(1.4, size / 360) * Math.sqrt(Math.min(zoom, 4));
      for (let g = 0; g < groups; g++) {
        const band = BANDS[Math.floor(g / colours.length)];
        context.globalAlpha = band.alpha * (dimmed ? 0.6 : 1);
        context.fillStyle = colours[g % colours.length];
        const d = dot * band.size;
        for (let k = starts[g]; k < starts[g + 1]; k++) {
          const i = order[k];
          context.fillRect(
            projected[i * 2] - d / 2,
            projected[i * 2 + 1] - d / 2,
            d,
            d,
          );
        }
      }

      context.font = `${detailed ? 11 : 10}px var(--font-geist), sans-serif`;
      context.textAlign = "center";
      context.fillStyle = ink;
      if (!dimmed || detailed) {
        for (const label of labels) {
          const [x, y, z] = project(label.x, label.y, label.z);
          context.globalAlpha = (dimmed ? 0.45 : 0.85) * (z > 0.15 ? 0.5 : 1);
          context.fillText(label.text, x, y);
        }
      }

      context.globalAlpha = 1;
      const query = highlighted.query
        ? project(highlighted.query.x, highlighted.query.y, highlighted.query.z)
        : null;
      if (detailed && query) {
        context.strokeStyle = ink;
        context.globalAlpha = 0.4;
        context.beginPath();
        for (const point of highlighted.points.slice(0, LINKED_RESULTS)) {
          const [x, y] = project(point.x, point.y, point.z);
          context.moveTo(query[0], query[1]);
          context.lineTo(x, y);
        }
        context.stroke();
        context.globalAlpha = 1;
      }
      context.fillStyle = ink;
      for (const point of highlighted.points) {
        const [x, y, , f] = project(point.x, point.y, point.z);
        context.beginPath();
        context.arc(x, y, (detailed ? 3 : 2.2) * f, 0, Math.PI * 2);
        context.fill();
      }
      if (query) {
        context.strokeStyle = ink;
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(
          query[0],
          query[1],
          (detailed ? 9 : 7) * query[3],
          0,
          Math.PI * 2,
        );
        context.stroke();
      }
    };
    dirty.current = true;
    render();
    return () => cancelAnimationFrame(frameId);
  }, [map, size, categoryOf, labels, highlighted, detailed, reducedMotion]);

  function findHover(sx: number, sy: number): Hover {
    const points = screen.current;
    const reach = 49;
    let best: Hover = null;
    let bestDistance = reach;
    // Results first: they're what the visitor is looking at. Their screen
    // position is the projected one of their catalog point.
    if (highlighted.points.length) {
      const index = new Map<number, number>();
      map.ids.forEach((id, i) => index.set(id, i));
      for (const point of highlighted.points) {
        const i = index.get(point.result.id)!;
        const d = (points[i * 2] - sx) ** 2 + (points[i * 2 + 1] - sy) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = {
            left: points[i * 2],
            top: points[i * 2 + 1],
            text: `${point.result.product.name}, ${point.result.score.toFixed(3)}`,
          };
        }
      }
      if (best) return best;
    }
    for (let i = 0; i < map.ids.length; i++) {
      const d = (points[i * 2] - sx) ** 2 + (points[i * 2 + 1] - sy) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = {
          left: points[i * 2],
          top: points[i * 2 + 1],
          text: map.meta.types[map.types[i]],
        };
      }
    }
    return best;
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (drag.current) {
      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      drag.current = { x: event.clientX, y: event.clientY };
      view.current.yaw += dx * 0.008;
      view.current.pitch = Math.max(
        -1.45,
        Math.min(1.45, view.current.pitch + dy * 0.008),
      );
      dirty.current = true;
      setHover(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setHover(findHover(event.clientX - rect.left, event.clientY - rect.top));
  }

  // Wheel zoom in the expanded view, without scrolling anything behind it.
  useEffect(() => {
    const element = canvas.current;
    if (!element || !detailed) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      view.current.zoom = Math.min(
        8,
        Math.max(0.6, view.current.zoom * Math.exp(-event.deltaY * 0.0015)),
      );
      touched.current = true;
      dirty.current = true;
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [detailed]);

  const description =
    `3D map of ${map.ids.length.toLocaleString("en")} products by image similarity` +
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
        className={`block cursor-grab rounded-sm border border-rule active:cursor-grabbing ${detailed ? "mx-auto touch-none" : ""}`}
        onPointerEnter={() => {
          pointerInside.current = true;
        }}
        onPointerDown={(event) => {
          // On phones the compact map leaves touch to page scrolling.
          if (!detailed && event.pointerType !== "mouse") return;
          drag.current = { x: event.clientX, y: event.clientY };
          touched.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          pointerInside.current = false;
          setHover(null);
        }}
        onDoubleClick={() => {
          view.current = { ...DEFAULT_VIEW };
          touched.current = false;
          dirty.current = true;
        }}
      />
      {hover && (
        <span
          className="pointer-events-none absolute z-10 max-w-56 -translate-x-1/2 -translate-y-full rounded-sm bg-ink px-2 py-1 text-xs text-paper"
          style={{ left: hover.left + offset, top: hover.top - 8 }}
        >
          {hover.text}
        </span>
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
          ? "Your query (ring) and its results (dots), in 3D"
          : "Every product in 3D, placed by image similarity"}
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
 * watch where the query lands and which products are its neighbours. The
 * page behind it doesn't scroll while it's open.
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

  // Lock the page scroll behind the dialog.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (text.trim()) onSearch(text);
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="expanded-map-title"
      onClose={onClose}
      className="m-auto h-[min(92dvh,56rem)] w-[min(96vw,80rem)] max-w-none overscroll-contain rounded-md border border-rule bg-paper p-0 text-ink backdrop:bg-black/50"
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
                Each dot is a product photo, placed in 3D so that similar photos
                sit close together. Your query lands at the ring, among the
                products it matches best; lines join it to its {LINKED_RESULTS}{" "}
                closest results. Drag to rotate, scroll to zoom, double-click to
                reset.
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
