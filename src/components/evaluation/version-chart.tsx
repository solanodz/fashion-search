"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * One bar per version of the search: the share of top-10 results with every
 * attribute right. English and Spanish versions use two shades of one hue
 * (validated for light and dark mode), named in the legend.
 */

export type VersionBar = {
  label: string;
  language: "English" | "Spanish";
  all: number;
  type: number;
  colour: number;
  gender: number;
};

const FILL = {
  English: "var(--viz-after)",
  Spanish: "var(--viz-before)",
} as const;

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: VersionBar }[];
}) {
  const bar = payload?.[0]?.payload;
  if (!active || !bar) return null;
  return (
    <div className="rounded-md border border-rule bg-paper px-3 py-2 text-xs shadow-[0_4px_16px_rgb(0_0_0/0.08)]">
      <p className="font-medium text-ink">{bar.label}</p>
      <p className="mt-1 text-ink tabular-nums">All correct: {bar.all}%</p>
      <p className="text-muted tabular-nums">
        Type {bar.type}% · Colour {bar.colour}% · Gender {bar.gender}%
      </p>
    </div>
  );
}

export function VersionChart({ bars }: { bars: VersionBar[] }) {
  return (
    <figure>
      <figcaption>
        <p className="font-medium">Results with everything right, by version</p>
        <p className="mt-0.5 text-sm text-muted">
          Average over the 27 searches. Higher is better.
        </p>
        <p className="mt-2 flex gap-4 text-xs text-muted">
          {(["English", "Spanish"] as const).map((language) => (
            <span key={language} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ background: FILL[language] }}
              />
              {language} searches
            </span>
          ))}
        </p>
      </figcaption>
      <div
        className="mt-4 h-72"
        role="img"
        aria-label={`Results with everything right: ${bars.map((b) => `${b.label} ${b.all}%`).join(", ")}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={bars}
            margin={{ top: 24, right: 8, bottom: 4, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--rule)" />
            <XAxis
              dataKey="label"
              interval={0}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--rule)" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(value: number) => `${value}%`}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ fill: "var(--rule)", opacity: 0.35 }}
              content={<ChartTooltip />}
            />
            <Bar
              dataKey="all"
              radius={[4, 4, 0, 0]}
              maxBarSize={56}
              isAnimationActive={false}
            >
              {bars.map((bar) => (
                <Cell key={bar.label} fill={FILL[bar.language]} />
              ))}
              <LabelList
                dataKey="all"
                position="top"
                formatter={(value) => `${value}%`}
                fill="var(--ink)"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
