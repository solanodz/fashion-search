"use client";

import { useEffect, useRef } from "react";

import type { Photo } from "./search-experience";

/** Thumbnail size in CSS pixels. */
const WIDTH = 24;
const HEIGHT = 32;

/**
 * The query photo, shown as a thumbnail at the start of the search bar. It is
 * drawn from the file's bytes onto a canvas, so no URL built from page data
 * ever reaches an `src` attribute.
 */
export function PhotoChip({
  photo,
  onRemove,
}: {
  photo: Photo;
  onRemove: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let cancelled = false;
    createImageBitmap(photo.blob)
      .then((bitmap) => {
        if (cancelled) return bitmap.close();
        const ratio = window.devicePixelRatio || 1;
        element.width = WIDTH * ratio;
        element.height = HEIGHT * ratio;
        const context = element.getContext("2d");
        if (!context) return bitmap.close();
        // Contain: the whole photo, centred, keeping its proportions.
        const scale = Math.min(
          element.width / bitmap.width,
          element.height / bitmap.height,
        );
        const w = bitmap.width * scale;
        const h = bitmap.height * scale;
        context.drawImage(
          bitmap,
          (element.width - w) / 2,
          (element.height - h) / 2,
          w,
          h,
        );
        bitmap.close();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photo.blob]);

  return (
    <span className="flex shrink-0 items-center gap-1 pl-1">
      {/* isolate: the multiply blend mixes with the tile, not the search bar. */}
      <span className="isolate flex h-8 w-6 rounded-sm bg-tile">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Search photo: ${photo.label.replace(/[“”]/g, "")}`}
          className="h-full w-full mix-blend-multiply"
        />
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        className="flex size-6 items-center justify-center text-muted hover:text-ink"
      >
        ×
      </button>
    </span>
  );
}
