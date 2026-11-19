import type { Photo } from "./search-experience";

/** The query photo, shown as a thumbnail at the start of the search bar. */
export function PhotoChip({
  photo,
  onRemove,
}: {
  photo: Photo;
  onRemove: () => void;
}) {
  // Only object URLs created by this page (URL.createObjectURL) are rendered,
  // never a string that came from elsewhere.
  const src = photo.url.startsWith("blob:") ? photo.url : undefined;
  return (
    <span className="flex shrink-0 items-center gap-1 pl-1">
      {/* Blob URL of a local photo; next/image can't optimize it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Search photo: ${photo.label.replace(/[“”]/g, "")}`}
        className="h-8 w-6 rounded-sm bg-tile object-contain mix-blend-multiply"
      />
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
