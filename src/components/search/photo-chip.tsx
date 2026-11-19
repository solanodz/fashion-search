import type { Photo } from "./search-experience";

/** The query photo, set inline in the search sentence like a word. */
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
    <span className="relative mr-[0.25em] inline-block h-[0.9em] align-[-0.08em]">
      {/* Blob URL of a local photo; next/image can't optimize it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Search photo: ${photo.label.replace(/[“”]/g, "")}`}
        className="h-full w-auto max-w-[2.2em] rounded-[0.08em] bg-tile object-contain"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-ink text-base leading-none text-lining hover:bg-indigo"
      >
        ×
      </button>
    </span>
  );
}
