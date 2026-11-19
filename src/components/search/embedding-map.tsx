"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  decodeMap,
  type EmbeddingMap,
  MAP_FILES,
  type MapMeta,
  placeQuery,
} from "@/lib/indexing/embedding-map";
import type { SearchResult } from "@/lib/search/schema";

/** Muted hue per master category; the map stays quiet next to the photos. */
const CATEGORY_COLOURS: Record<string, string> = {
  Apparel: "#7f8fb5",
  Accessories: "#c3a35e",
  Footwear: "#7ea58b",
  "Personal Care": "#c58c9d",
};
const OTHER_COLOUR = "#a1a19b";
const LABELLED_TYPES = 9;

type Hover = { x: number; y: number; text: string } | null;

/**
 * Every product's image vector projected to 2D (UMAP, ADR 0010), with the
 * current results and the query drawn on top. Similar products sit close
 * together, which is what the search relies on.
 */
export function EmbeddingMapView({
  results,
}: {
  results: SearchResult[] | null;
}) {
  const [map, setMap] = useState<EmbeddingMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const [width, setWidth] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/${MAP_FILES.meta}`).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<MapMeta>;
      }),
      fetch(`/${MAP_FILES.points}`).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      }),
    ])
      .then(([meta, bytes]) => !cancelled && setMap(decodeMap(bytes, meta)))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    // Older browsers and test environments: size once.
    if (typeof ResizeObserver === "undefined") {
      setWidth(element.clientWidth);
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const index = useMemo(() => {
    const byId = new Map<number, number>();
    map?.ids.forEach((id, i) => byId.set(id, i));
    return byId;
  }, [map]);

  // Label the largest article types at the median of their points.
  const labels = useMemo(() => {
    if (!map) return [];
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
      .slice(0, LABELLED_TYPES)
      .map(([type, { xs, ys }]) => ({
        text: map.meta.types[type],
        x: median(xs),
        y: median(ys),
      }));
  }, [map]);

  const highlighted = useMemo(() => {
    if (!map || !results) return { points: [], query: null };
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

  useEffect(() => {
    const element = canvas.current;
    if (!element || !map || width === 0) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = width * ratio;
    element.height = width * ratio;
    const context = element.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, width);
    const styles = getComputedStyle(element);
    const ink = styles.getPropertyValue("--ink").trim() || "#21201c";
    const pad = 6;
    const scale = width - pad * 2;
    const at = (x: number, y: number) => [pad + x * scale, pad + y * scale];

    const dimmed = highlighted.points.length > 0;
    context.globalAlpha = dimmed ? 0.25 : 0.5;
    for (let i = 0; i < map.ids.length; i++) {
      const type = map.meta.types[map.types[i]];
      context.fillStyle =
        CATEGORY_COLOURS[map.meta.categories[type]] ?? OTHER_COLOUR;
      const [x, y] = at(map.xy[i * 2], map.xy[i * 2 + 1]);
      context.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    }

    context.globalAlpha = 1;
    context.font = "10px var(--font-geist), sans-serif";
    context.textAlign = "center";
    context.fillStyle = ink;
    if (!dimmed) {
      for (const label of labels) {
        const [x, y] = at(label.x, label.y);
        context.fillText(label.text, x, y);
      }
    }

    context.fillStyle = ink;
    for (const point of highlighted.points) {
      const [x, y] = at(point.x, point.y);
      context.beginPath();
      context.arc(x, y, 2.2, 0, Math.PI * 2);
      context.fill();
    }
    if (highlighted.query) {
      const [x, y] = at(highlighted.query.x, highlighted.query.y);
      context.strokeStyle = ink;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(x, y, 7, 0, Math.PI * 2);
      context.stroke();
    }
  }, [map, width, labels, highlighted]);

  function onMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!map || width === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pad = 6;
    const scale = width - pad * 2;
    const px = (event.clientX - rect.left - pad) / scale;
    const py = (event.clientY - rect.top - pad) / scale;
    const reach = 6 / scale;
    // Results first: they're what the visitor is looking at.
    let best: Hover = null;
    let bestDistance = reach * reach;
    for (const point of highlighted.points) {
      const d = (point.x - px) ** 2 + (point.y - py) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = {
          x: point.x,
          y: point.y,
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
          best = { x, y, text: map.meta.types[map.types[i]] };
        }
      }
    }
    setHover(best);
  }

  const description = map
    ? `Map of ${map.ids.length.toLocaleString("en")} products by image similarity` +
      (highlighted.points.length
        ? `, with the query and its ${highlighted.points.length} results highlighted`
        : "")
    : "Map of the catalog by image similarity";

  return (
    <section aria-labelledby="map-title" className="mt-10">
      <h2 id="map-title" className="font-medium">
        Embedding space
      </h2>
      <p className="mt-1 text-sm text-muted">
        {highlighted.query
          ? "Your query (ring) and its results (dots) among all products"
          : "Every product, placed by image similarity (UMAP)"}
      </p>
      <div ref={frame} className="relative mt-3 aspect-square w-full">
        {failed ? (
          <p className="text-sm text-muted">The map is not available.</p>
        ) : (
          <canvas
            ref={canvas}
            role="img"
            aria-label={description}
            className="h-full w-full rounded-sm border border-rule"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        )}
        {hover && (
          <span
            className="pointer-events-none absolute z-10 max-w-48 -translate-x-1/2 -translate-y-full rounded-sm bg-ink px-2 py-1 text-xs text-paper"
            style={{
              left: `calc(6px + ${hover.x} * (100% - 12px))`,
              top: `calc(6px + ${hover.y} * (100% - 12px) - 8px)`,
            }}
          >
            {hover.text}
          </span>
        )}
      </div>
    </section>
  );
}
