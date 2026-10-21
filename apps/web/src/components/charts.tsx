"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Ejes de los gráficos a 10 px, cifras tabulares.
const AXIS = { fontSize: "var(--fs-axis)", fill: "var(--text-3)", fontFamily: "var(--font-sans)" };
const TOOLTIP_STYLE = { fontSize: "var(--fs-ui)", borderRadius: 8, border: "1px solid var(--border)" };
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

type Series = { key: string; label: string; color?: string };

export function TimeChart({
  data,
  xKey,
  series,
  kind = "bar",
  height = 240,
  format = (v: number) => String(v),
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: Series[];
  kind?: "bar" | "line";
  height?: number;
  format?: (v: number) => string;
}) {
  const Chart = kind === "bar" ? BarChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => format(Number(v))} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => format(Number(v))} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: "var(--fs-note)" }} />}
        {series.map((s, i) =>
          kind === "bar" ? (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? SERIES[i]} radius={[3, 3, 0, 0]} maxBarSize={28} />
          ) : (
            <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color ?? SERIES[i]} strokeWidth={2} dot={false} type="monotone" />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data,
  height = 220,
  format = (v: number) => String(v),
}: {
  data: { label: string; value: number }[];
  height?: number;
  format?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={SERIES[i % SERIES.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => format(Number(v))} />
        <Legend wrapperStyle={{ fontSize: "var(--fs-note)" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
