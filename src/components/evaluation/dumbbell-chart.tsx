"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Before → after per test search, as a dumbbell chart: a hairline from the
 * old precision to the new one, a light dot for before and a dark one for
 * after (one hue, two shades, validated for light and dark mode). Rows are
 * sorted by the change, so gains read top-down and losses sit at the bottom.
 */

export type DumbbellRow = { label: string; before: number; after: number };

type Datum = DumbbellRow & { range: [number, number]; change: number };

const ROW_HEIGHT = 24;

function ChartTooltip({
  active,
  payload,
  beforeLabel,
  afterLabel,
}: {
  active?: boolean;
  payload?: { payload: Datum }[];
  beforeLabel: string;
  afterLabel: string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const sign = row.change > 0 ? "+" : "";
  return (
    <div className="rounded-md border border-rule bg-paper px-3 py-2 text-xs shadow-[0_4px_16px_rgb(0_0_0/0.08)]">
      <p className="font-medium text-ink">{row.label}</p>
      <p className="mt-1 text-muted tabular-nums">
        {beforeLabel}: {row.before}% · {afterLabel}: {row.after}%
      </p>
      <p className="text-ink tabular-nums">
        {sign}
        {row.change} points
      </p>
    </div>
  );
}

/** A one-line axis label, shortened with an ellipsis; Recharts' own labels wrap. */
function Tick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  const value = payload?.value ?? "";
  const text = value.length > 27 ? `${value.slice(0, 26)}…` : value;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="var(--muted)" fontSize={11}>
      <title>{value}</title>
      {text}
    </text>
  );
}

function Dot({ cx, cy, fill }: { cx?: number; cy?: number; fill?: string }) {
  if (cx === undefined || cy === undefined) return null;
  // A ring in the surface colour keeps overlapping dots apart.
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={fill}
      stroke="var(--paper)"
      strokeWidth={2}
    />
  );
}

export function DumbbellChart({
  title,
  description,
  rows,
  beforeLabel,
  afterLabel,
}: {
  title: string;
  description: string;
  rows: DumbbellRow[];
  beforeLabel: string;
  afterLabel: string;
}) {
  const data: Datum[] = rows
    .map((row) => ({
      ...row,
      range: [
        Math.min(row.before, row.after),
        Math.max(row.before, row.after),
      ] as [number, number],
      change: row.after - row.before,
    }))
    .sort((a, b) => b.change - a.change || b.after - a.after);
  const improved = data.filter((row) => row.change > 0).length;
  const worse = data.filter((row) => row.change < 0).length;

  return (
    <figure className="min-w-0">
      <figcaption>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted">
          {description} {improved} better, {worse} worse,{" "}
          {data.length - improved - worse} unchanged.
        </p>
        <p className="mt-2 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: "var(--viz-before)" }}
            />
            {beforeLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: "var(--viz-after)" }}
            />
            {afterLabel}
          </span>
        </p>
      </figcaption>
      <div
        className="mt-3"
        style={{ height: data.length * ROW_HEIGHT + 40 }}
        role="img"
        aria-label={`${title}: ${improved} of ${data.length} searches improved from ${beforeLabel} to ${afterLabel}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid
              horizontal={false}
              stroke="var(--rule)"
              strokeDasharray="0"
            />
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(value: number) => `${value}%`}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              orientation="top"
            />
            <YAxis
              type="category"
              dataKey="label"
              width={200}
              interval={0}
              tick={<Tick />}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--rule)", opacity: 0.35 }}
              content={
                <ChartTooltip
                  beforeLabel={beforeLabel}
                  afterLabel={afterLabel}
                />
              }
            />
            <Bar
              dataKey="range"
              barSize={2}
              fill="var(--line-strong)"
              isAnimationActive={false}
            />
            <Scatter
              dataKey="before"
              fill="var(--viz-before)"
              shape={<Dot />}
              isAnimationActive={false}
            />
            <Scatter
              dataKey="after"
              fill="var(--viz-after)"
              shape={<Dot />}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
