"use client";

import type { Facets, FacetValue } from "@/lib/search/facets";
import { COLOUR_SWATCHES, swatchFor } from "@/lib/search/colours";
import type { SearchFilters } from "@/lib/search/schema";

const number = new Intl.NumberFormat("en");

type Props = {
  facets: Facets;
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
};

export function Filters({ facets, filters, onChange }: Props) {
  const set = (patch: SearchFilters) => onChange({ ...filters, ...patch });

  // Swatches keep a fixed order so they don't move as counts change; colours
  // with no products in the current selection are dimmed and disabled.
  const counts = new Map(
    facets.baseColour.map(({ value, count }) => [value, count]),
  );
  const colours = [
    ...new Set([...Object.keys(COLOUR_SWATCHES), ...counts.keys()]),
  ].map((value) => ({
    value,
    count: counts.get(value) ?? 0,
  }));
  const active = Object.values(filters).some(Boolean);

  return (
    <div className="mt-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FacetSelect
          label="Gender"
          anyLabel="Any gender"
          values={facets.gender}
          selected={filters.gender}
          onSelect={(gender) => set({ gender })}
        />
        <FacetSelect
          label="Category"
          anyLabel="Any category"
          values={facets.masterCategory}
          selected={filters.masterCategory}
          // A type from another category would match nothing.
          onSelect={(masterCategory) =>
            set({ masterCategory, articleType: undefined })
          }
        />
        <FacetSelect
          label="Type"
          anyLabel="Any type"
          values={facets.articleType}
          selected={filters.articleType}
          onSelect={(articleType) => set({ articleType })}
        />
        {active && (
          <button
            type="button"
            className="ml-1 text-base text-graphite underline underline-offset-4 hover:text-indigo"
            onClick={() => onChange({})}
          >
            Clear filters
          </button>
        )}
      </div>

      <fieldset>
        <legend className="sr-only">Colour</legend>
        <div className="flex flex-wrap items-center gap-2">
          {colours.map(({ value, count }) => {
            const selected = filters.baseColour === value;
            const empty = count === 0 && !selected;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                disabled={empty}
                aria-label={`${value}, ${number.format(count)} ${count === 1 ? "product" : "products"}`}
                title={`${value} (${number.format(count)})`}
                onClick={() =>
                  set({ baseColour: selected ? undefined : value })
                }
                className={`size-7 rounded-full border border-rule transition-transform enabled:hover:scale-110 disabled:cursor-not-allowed disabled:opacity-25 motion-reduce:transition-none ${
                  selected
                    ? "ring-3 ring-indigo ring-offset-2 ring-offset-lining"
                    : ""
                }`}
                style={{ background: swatchFor(value) }}
              />
            );
          })}
          {filters.baseColour && (
            <span className="ml-1 text-base text-graphite" aria-live="polite">
              {filters.baseColour}
            </span>
          )}
        </div>
      </fieldset>
    </div>
  );
}

function FacetSelect({
  label,
  anyLabel,
  values,
  selected,
  onSelect,
}: {
  label: string;
  anyLabel: string;
  values: FacetValue[];
  selected: string | undefined;
  onSelect: (value: string | undefined) => void;
}) {
  // Keep the current selection listed even if its count dropped to zero.
  const options =
    selected && !values.some((v) => v.value === selected)
      ? [{ value: selected, count: 0 }, ...values]
      : values;
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={selected ?? ""}
        onChange={(event) => onSelect(event.target.value || undefined)}
        className={`appearance-none rounded-full border py-1.5 pr-8 pl-4 text-base transition-colors ${
          selected
            ? "border-indigo bg-indigo text-lining"
            : "border-rule bg-transparent text-ink hover:border-indigo"
        }`}
      >
        <option value="">{anyLabel}</option>
        {options.map(({ value, count }) => (
          <option key={value} value={value}>
            {value} ({number.format(count)})
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs"
      >
        ▾
      </span>
    </label>
  );
}
