import { IMAGE_BASE_URL } from "@/lib/images";
import { FEEDBACK_FIELDS, type Leaning } from "@/lib/search/feedback";
import type { SearchFeedback } from "@/lib/search/schema";

/**
 * The results the shopper marked (ADR 0016), and what the search made of
 * them: the fields the liked ones share come first, the fields only the
 * disliked ones have come last. Each mark can be removed.
 */
export function RefineBar({
  feedback,
  leaning,
  names,
  onRemove,
  onClear,
}: {
  feedback: SearchFeedback;
  leaning?: Leaning;
  /** Names of the marked products, when known. */
  names: Record<number, string>;
  onRemove: (id: number) => void;
  onClear: () => void;
}) {
  const marks = [
    ...feedback.like.map((id) => ({ id, liked: true })),
    ...feedback.dislike.map((id) => ({ id, liked: false })),
  ];
  if (marks.length === 0) return null;

  const first = FEEDBACK_FIELDS.flatMap(
    (field) => leaning?.prefer[field] ?? [],
  );
  const last = FEEDBACK_FIELDS.flatMap((field) => leaning?.avoid[field] ?? []);
  const list = (values: string[]) => values.join(", ").toLowerCase();

  return (
    <section
      aria-label="Your marks"
      className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-rule pb-4 text-sm"
    >
      <ul className="flex flex-wrap gap-2">
        {marks.map(({ id, liked }) => {
          const name = names[id] ?? `product ${id}`;
          return (
            <li key={id}>
              <button
                type="button"
                className="group relative block"
                title="Remove this mark"
                aria-label={`Remove the ${liked ? "like" : "dislike"} on ${name}`}
                onClick={() => onRemove(id)}
              >
                <span
                  className={`isolate flex h-14 w-11 items-center justify-center overflow-hidden rounded-sm bg-tile ${liked ? "" : "opacity-50"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${IMAGE_BASE_URL}/${id}`}
                    alt=""
                    className="h-full w-full object-contain mix-blend-multiply"
                  />
                </span>
                <span
                  aria-hidden
                  className="absolute -top-1.5 -left-1.5 flex size-4 items-center justify-center rounded-full border border-rule bg-paper text-[10px] leading-none group-hover:hidden"
                >
                  {liked ? "+" : "−"}
                </span>
                <span
                  aria-hidden
                  className="absolute -top-1.5 -left-1.5 hidden size-4 items-center justify-center rounded-full border border-ink bg-paper text-[10px] leading-none group-hover:flex"
                >
                  ×
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="min-w-40 flex-1 leading-snug text-muted">
        {first.length > 0
          ? `First, what your likes share: ${list(first)}.`
          : feedback.like.length > 0
            ? "Moved towards the look of what you liked."
            : "Moved away from the look of what you disliked."}
        {last.length > 0 && ` Last: ${list(last)}.`}
      </p>
      <button
        type="button"
        className="link text-muted hover:text-ink"
        onClick={onClear}
      >
        Clear marks
      </button>
    </section>
  );
}
