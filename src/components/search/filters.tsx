"use client";

import type { Facets, FacetValue } from "@/lib/search/facets";
import { COLOUR_SWATCHES, swatchFor } from "@/lib/search/colours";
import type { SearchFilters } from "@/lib/search/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">Filters</h2>
        {active && (
          <button
            type="button"
            className="link text-sm text-muted hover:text-ink"
            onClick={() => onChange({})}
          >
            Clear filters
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 lg:flex-col">
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
      </div>

      <fieldset>
        <legend className="mb-2 text-sm text-muted">Colour</legend>
        <div className="flex flex-wrap items-center gap-1.5">
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
                className={`size-4 rounded-full border border-rule transition-transform enabled:hover:scale-125 disabled:cursor-not-allowed disabled:opacity-25 motion-reduce:transition-none ${
                  selected
                    ? "ring-1 ring-ink ring-offset-2 ring-offset-paper"
                    : ""
                }`}
                style={{ background: swatchFor(value) }}
              />
            );
          })}
          {filters.baseColour && (
            <span className="ml-1 text-sm text-muted" aria-live="polite">
              {filters.baseColour}
            </span>
          )}
        </div>
      </fieldset>
    </div>
  );
}

// Radix Select items can't have an empty value, so "any" gets a sentinel.
const ANY = "__any__";

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
    <div className="min-w-36 flex-1 lg:flex-none">
      <Select
        value={selected ?? ANY}
        onValueChange={(value) => onSelect(value === ANY ? undefined : value)}
      >
        <SelectTrigger
          aria-label={label}
          className={selected ? "border-ink" : ""}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{anyLabel}</SelectItem>
          {options.map(({ value, count }) => (
            <SelectItem key={value} value={value} detail={number.format(count)}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
