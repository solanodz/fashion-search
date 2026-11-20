"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  BrowserIcon,
  EncodeVisual,
  FuseVisual,
  KeywordsVisual,
  QueryVisual,
  ResultsVisual,
  SearchVisual,
  ServerIcon,
} from "./flow-visuals";

/**
 * The path of a search as a flowchart of text and hairlines, adapted from
 * the workflow chart on the author's portfolio: each stage is a name and a
 * sentence; thin arrows connect them, each carrying a beam (dark head,
 * fading tail) that runs its length, all out of step, so the chart reads as
 * a search in motion. The stage under the pointer darkens. Motion rests off
 * screen and for visitors who ask for reduced motion.
 */

type StageId = "query" | "encode" | "keywords" | "search" | "fuse" | "results";

type Stage = {
  id: StageId;
  label: string;
  where: "Your browser" | "Server";
  description: string;
  /** A piece of the real search UI showing what the stage produces. */
  visual: () => React.ReactNode;
};

/** In reading order; on phones this is also the order on screen. */
const STAGES: Stage[] = [
  {
    id: "query",
    visual: QueryVisual,
    label: "Query",
    where: "Your browser",
    description:
      "You type a few words, add a photo, or both. Nothing you type or upload is sent anywhere.",
  },
  {
    id: "encode",
    visual: EncodeVisual,
    label: "CLIP",
    where: "Your browser",
    description:
      "A model downloaded once turns the query into 512 numbers that describe how it looks. Photo and words share the same space.",
  },
  {
    id: "keywords",
    visual: KeywordsVisual,
    label: "Keywords",
    where: "Your browser",
    description:
      "For text searches, the words are simplified and hashed into codes, so names can be matched without sending the text.",
  },
  {
    id: "search",
    visual: SearchVisual,
    label: "Qdrant",
    where: "Server",
    description:
      "The numbers are compared with the 42,426 product photos, already turned into numbers. The closest ones by cosine similarity come back.",
  },
  {
    id: "fuse",
    visual: FuseVisual,
    label: "Fusion",
    where: "Server",
    description:
      "The image matches and the keyword matches are merged by rank, so products near the top of both lists rise.",
  },
  {
    id: "results",
    visual: ResultsVisual,
    label: "Results",
    where: "Your browser",
    description:
      "The closest products, each with its similarity. Filters narrow them; any result can start the next search.",
  },
];

/** Each stage's place in the wide layout: two rows of three. */
const WIDE_CELL: Record<StageId, string> = {
  query: "sm:col-start-1 sm:row-start-1",
  encode: "sm:col-start-2 sm:row-start-1",
  search: "sm:col-start-3 sm:row-start-1",
  keywords: "sm:col-start-1 sm:row-start-2",
  fuse: "sm:col-start-2 sm:row-start-2",
  results: "sm:col-start-3 sm:row-start-2",
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const CORNER = 10;
/** How far in from a stage's left edge vertical lines run. */
const SPINE = 32;
/** Air between a connector's end and the text it points at. */
const GAP = 10;
/** How far past the right edge the return line travels. */
const RAIL = 12;
/** How far above the first row the return line crosses. */
const OVERHEAD = 26;
const BEAM_LAYERS = 12;

type Rect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  labelRight: number;
  labelCy: number;
};
/** A measured piece inside a stage: its box and the vertical center of its photos. */
type Anchor = { left: number; right: number; cy: number };
type Point = [number, number];
type Direction = "down" | "left" | "right";
type Edge = {
  id: string;
  points: Point[];
  arrow: Direction;
  /** Draw as a smooth curve between the last two points, without a beam. */
  curve?: boolean;
  label?: { text: string; at: Point };
};

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

/** Snap to the pixel grid so 1px strokes stay crisp. */
const snap = (value: number) => Math.round(value) + 0.5;

/** A polyline through `route` with its corners rounded. */
function roundedPath(route: Point[]) {
  const points = route.filter(
    (point, i) =>
      i === 0 || point[0] !== route[i - 1][0] || point[1] !== route[i - 1][1],
  );
  if (points.length < 2) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const inLength = Math.hypot(cx - px, cy - py);
    const outLength = Math.hypot(nx - cx, ny - cy);
    const radius = Math.min(CORNER, inLength / 2, outLength / 2);
    const ax = cx - ((cx - px) / inLength) * radius;
    const ay = cy - ((cy - py) / inLength) * radius;
    const bx = cx + ((nx - cx) / outLength) * radius;
    const by = cy + ((ny - cy) / outLength) * radius;
    d += ` L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  }
  const [lastX, lastY] = points[points.length - 1];
  return `${d} L ${lastX} ${lastY}`;
}

/**
 * Straight from the first point to the second, a horizontal S-curve from
 * there to the third, then straight to the end.
 */
function curvedPath(points: Point[]) {
  const [start, from, join, ...rest] = points;
  const mid = from[0] + (join[0] - from[0]) / 2;
  const tail = rest.map(([x, y]) => ` L ${x} ${y}`).join("");
  return (
    `M ${start[0]} ${start[1]} L ${from[0]} ${from[1]} ` +
    `C ${mid} ${from[1]} ${mid} ${join[1]} ${join[0]} ${join[1]}` +
    tail
  );
}

function routeLength(points: Point[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
    );
  }
  return total;
}

/**
 * A beam per connector, drawn as stacked dashes that share one head and get
 * shorter and more opaque towards it, so the tail fades along bent paths.
 */
function beamLayers(points: Point[], index: number): React.CSSProperties[] {
  const length = routeLength(points);
  if (length < 1) return [];
  const beam = Math.min(130, Math.max(28, length * 0.5)) / length;
  const seconds = Math.min(3, Math.max(0.9, length / 160));
  return Array.from({ length: BEAM_LAYERS }, (_, layer) => {
    const progress = layer / (BEAM_LAYERS - 1);
    const dash = beam * (1 - progress * 0.92);
    return {
      "--beam": `${dash}px`,
      strokeDasharray: `${dash} ${1 - dash}`,
      strokeOpacity: 0.06 + 0.5 * progress * progress,
      animationDuration: `${seconds}s`,
      animationDelay: `${-0.37 * (index + 1)}s`,
    } as React.CSSProperties;
  });
}

function arrowPath([x, y]: Point, direction: Direction) {
  switch (direction) {
    case "down":
      return `M ${x - 4} ${y - 5} L ${x} ${y} L ${x + 4} ${y - 5}`;
    case "left":
      return `M ${x + 5} ${y - 4} L ${x} ${y} L ${x + 5} ${y + 4}`;
    case "right":
      return `M ${x - 5} ${y - 4} L ${x} ${y} L ${x - 5} ${y + 4}`;
  }
}

/**
 * Connectors routed from the measured text blocks.
 *
 * Wide: the browser work runs along the first row (Query → CLIP → Qdrant);
 * Query also drops to Keywords for text searches. Qdrant wraps down into
 * Fusion, Keywords joins it from the left, Fusion leads to Results, and
 * "More like this" returns from Results over the top to Query.
 *
 * Stacked (phones): one column in reading order, a line dropping from stage
 * to stage, and the return line up the right side.
 */
function buildEdges(
  rects: Record<StageId, Rect>,
  anchors: Record<string, Anchor>,
  width: number,
): Edge[] {
  const { query, encode, keywords, search, fuse, results } = rects;
  const wide = encode.left >= query.right;
  // Phones keep the return line inside the list's right padding.
  const rail = snap(wide ? width + RAIL : width - RAIL);
  const edges: Edge[] = [];

  const across = (from: StageId, to: StageId) => {
    const y = snap(rects[from].labelCy);
    edges.push({
      id: `${from}-${to}`,
      points: [
        [rects[from].labelRight + GAP, y],
        [rects[to].left - GAP, y],
      ],
      arrow: "right",
    });
  };

  if (wide) {
    across("query", "encode");
    across("encode", "search");

    const queryX = snap(query.left + SPINE);
    const textTop = query.bottom + GAP;
    const textBottom = keywords.top - GAP;
    edges.push({
      id: "query-keywords",
      points: [
        [queryX, textTop],
        [queryX, textBottom],
      ],
      arrow: "down",
      label: {
        text: "if there are words",
        at: [queryX, (textTop + textBottom) / 2],
      },
    });

    const firstRowBottom = Math.max(query.bottom, encode.bottom, search.bottom);
    const turnY = snap((firstRowBottom + fuse.top) / 2);
    const fromX = snap(search.left + SPINE);
    const intoX = snap(fuse.left + SPINE);
    edges.push({
      id: "search-fuse",
      points: [
        [fromX, search.bottom + GAP],
        [fromX, turnY],
        [intoX, turnY],
        [intoX, fuse.top - GAP],
      ],
      arrow: "down",
    });

    across("keywords", "fuse");
    across("fuse", "results");

    // Inside Fusion: the image list and the keyword list each leave their row
    // and join into one arrow pointing at the merged results.
    const image = anchors["fuse-image"];
    const words = anchors["fuse-keywords"];
    const merged = anchors["results-row"];
    if (image && words && merged) {
      // Both lists run straight a little, curve towards each other, meet
      // most of the way to the results and finish as one short arrow.
      const startX = Math.max(image.right, words.right) + GAP * 2;
      const into: Point = [merged.left - GAP * 1.5, snap(merged.cy)];
      const span = into[0] - startX;
      const curveFrom = snap(startX + span * 0.2);
      const join: Point = [snap(startX + span * 0.72), into[1]];
      for (const [id, row] of [
        ["image", image],
        ["keywords", words],
      ] as const) {
        edges.push({
          id: `fuse-${id}-results`,
          points: [
            [startX, snap(row.cy)],
            [curveFrom, snap(row.cy)],
            join,
            into,
          ],
          arrow: "right",
          curve: true,
        });
      }
    }

    const topY = snap(query.top - OVERHEAD);
    const resultsY = snap(results.labelCy);
    edges.push({
      id: "results-query",
      points: [
        [results.labelRight + GAP, resultsY],
        [rail, resultsY],
        [rail, topY],
        [queryX, topY],
        [queryX, query.top - GAP],
      ],
      arrow: "down",
      label: { text: "More like this", at: [(queryX + rail) / 2, topY] },
    });
    return edges;
  }

  const order: StageId[] = STAGES.map((stage) => stage.id);
  for (let i = 0; i < order.length - 1; i++) {
    const from = rects[order[i]];
    const to = rects[order[i + 1]];
    const x = snap(from.left + SPINE);
    edges.push({
      id: `${order[i]}-${order[i + 1]}`,
      points: [
        [x, from.bottom + GAP],
        [x, to.top - GAP],
      ],
      arrow: "down",
    });
  }
  const resultsY = snap(results.labelCy);
  const queryY = snap(query.labelCy);
  edges.push({
    id: "results-query",
    points: [
      [results.labelRight + GAP, resultsY],
      [rail, resultsY],
      [rail, queryY],
      [query.labelRight + GAP, queryY],
    ],
    arrow: "left",
  });
  return edges;
}

export function SearchFlow() {
  const listRef = useRef<HTMLOListElement>(null);
  const nodeRefs = useRef(new Map<StageId, HTMLLIElement>());
  const [geometry, setGeometry] = useState<{
    rects: Record<StageId, Rect>;
    anchors: Record<string, Anchor>;
    width: number;
  } | null>(null);
  const [hovered, setHovered] = useState<StageId | null>(null);
  const [inView, setInView] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const running = inView && !reducedMotion;

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const frame = list.getBoundingClientRect();
      const rects = {} as Record<StageId, Rect>;
      for (const [id, node] of nodeRefs.current) {
        const box = node.getBoundingClientRect();
        const label = node
          .querySelector("[data-flow-label]")
          ?.getBoundingClientRect();
        const left = box.left - frame.left;
        const top = box.top - frame.top;
        rects[id] = {
          left,
          top,
          right: left + box.width,
          bottom: top + box.height,
          labelRight: label ? label.right - frame.left : left,
          labelCy: label ? label.top - frame.top + label.height / 2 : top,
        };
      }
      const anchors: Record<string, Anchor> = {};
      for (const element of list.querySelectorAll<HTMLElement>(
        "[data-flow-anchor]",
      )) {
        const box = element.getBoundingClientRect();
        const photo = element.querySelector("img")?.getBoundingClientRect();
        const middle = photo ?? box;
        anchors[element.dataset.flowAnchor!] = {
          left: box.left - frame.left,
          right: box.right - frame.left,
          cy: middle.top - frame.top + middle.height / 2,
        };
      }
      setGeometry({ rects, anchors, width: frame.width });
    };
    if (typeof ResizeObserver === "undefined") {
      measure();
      return;
    }
    const resize = new ResizeObserver(measure);
    resize.observe(list);
    const visibility = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.2 },
    );
    visibility.observe(list);
    return () => {
      resize.disconnect();
      visibility.disconnect();
    };
  }, []);

  const edges = geometry
    ? buildEdges(geometry.rects, geometry.anchors, geometry.width)
    : [];

  return (
    <ol
      ref={listRef}
      aria-label="The path of a search, from query to results"
      className="relative mt-16 mb-20 grid grid-cols-1 gap-y-20 pr-6 sm:grid-cols-3 sm:gap-x-14 sm:gap-y-32 sm:pr-0 lg:-mx-28 lg:gap-x-20 xl:-mx-44"
      onPointerLeave={() => setHovered(null)}
    >
      {STAGES.map((stage) => (
        <li
          key={stage.id}
          ref={(node) => {
            if (node) nodeRefs.current.set(stage.id, node);
            else nodeRefs.current.delete(stage.id);
          }}
          data-active={stage.id === hovered}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setHovered(stage.id);
          }}
          className={`flow-node sm:self-start ${WIDE_CELL[stage.id]}`}
        >
          <p>
            <span data-flow-label className="font-medium">
              {stage.label}
            </span>
          </p>
          <p className="flow-detail mt-2 text-sm leading-[1.7]">
            {stage.description}
          </p>
          <div aria-hidden className="pointer-events-none mt-2 select-none">
            <stage.visual />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            {stage.where === "Server" ? <ServerIcon /> : <BrowserIcon />}
            {stage.where}
          </p>
        </li>
      ))}

      {geometry && (
        <li aria-hidden className="contents">
          <svg
            data-running={running}
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
          >
            {edges.map((edge, index) => {
              const d = edge.curve
                ? curvedPath(edge.points)
                : roundedPath(edge.points);
              if (!d) return null;
              return (
                <g key={edge.id}>
                  <path d={d} className="flow-edge" />
                  <path
                    d={arrowPath(
                      edge.points[edge.points.length - 1],
                      edge.arrow,
                    )}
                    className="flow-edge flow-arrow"
                  />
                  {(edge.curve ? [] : beamLayers(edge.points, index)).map(
                    (style, layer) => (
                      <path
                        key={layer}
                        d={d}
                        pathLength={1}
                        className="flow-beam"
                        style={style}
                      />
                    ),
                  )}
                </g>
              );
            })}
          </svg>
          {edges.map((edge) =>
            edge.label ? (
              <span
                key={edge.id}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 bg-paper px-1.5 py-1 text-xs whitespace-nowrap text-muted"
                style={{ left: edge.label.at[0], top: edge.label.at[1] }}
              >
                {edge.label.text}
              </span>
            ) : null,
          )}
        </li>
      )}
    </ol>
  );
}
