"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compactEur, eur, pct } from "@/lib/format";
import type { MonthStat, Stats } from "@/lib/types";

// Une couleur par mesure, constante sur tout le tableau de bord.
export const COLORS = {
  revenue: "#2a78d6",
  commission: "#eb6834",
  count: "#6250d6",
  net: "#1baf7a",
};

const GRID = "#eef1f5";
const AXIS = { fontSize: 11, fill: "#64748b" };

type Formatter = (value: number) => string;
const integer: Formatter = (v) => v.toLocaleString("fr-FR");

interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-slate-900">{title}</div>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5 text-slate-500">
            {row.color ? <span className="h-2 w-2 rounded-sm" style={{ background: row.color }} /> : null}
            {row.label}
          </span>
          <span className="tabular font-medium text-slate-900">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeTooltip<T>(titleOf: (d: T) => string, rowsOf: (d: T) => TooltipRow[]) {
  return function ChartTooltip({ active, payload }: any) {
    const datum: T | undefined = payload?.[0]?.payload;
    if (!active || !datum) return null;
    return <TooltipBox title={titleOf(datum)} rows={rowsOf(datum)} />;
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const commonAxis = {
  x: { tickLine: false, axisLine: { stroke: "#e2e8f0" }, tick: AXIS, tickMargin: 8 },
  y: { tickLine: false, axisLine: false, tick: AXIS, width: 52 },
};

const RevenueTooltip = makeTooltip<MonthStat>(
  (m) => m.label,
  (m) => [
    { label: "Chiffre d'affaires", value: eur(m.revenue), color: COLORS.revenue },
    { label: "Net encaissé", value: eur(m.net) },
    { label: "Factures", value: integer(m.count) },
    { label: "Panier moyen", value: eur(m.average) },
  ],
);

export function RevenueChart({ months }: { months: MonthStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="short" {...commonAxis.x} />
        <YAxis {...commonAxis.y} tickFormatter={compactEur} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} content={<RevenueTooltip />} />
        <Bar dataKey="revenue" fill={COLORS.revenue} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const CumulativeTooltip = makeTooltip<MonthStat>(
  (m) => m.label,
  (m) => [
    { label: "CA cumulé", value: eur(m.cumulative), color: COLORS.revenue },
    { label: "CA du mois", value: eur(m.revenue) },
  ],
);

export function CumulativeChart({ months }: { months: MonthStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="cumulative-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.revenue} stopOpacity={0.22} />
            <stop offset="100%" stopColor={COLORS.revenue} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="short" {...commonAxis.x} />
        <YAxis {...commonAxis.y} tickFormatter={compactEur} />
        <Tooltip cursor={{ stroke: "#cbd5e1" }} content={<CumulativeTooltip />} />
        <Area
          type="monotone"
          dataKey="cumulative"
          stroke={COLORS.revenue}
          strokeWidth={2}
          fill="url(#cumulative-fill)"
          activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const CountTooltip = makeTooltip<MonthStat>(
  (m) => m.label,
  (m) => [{ label: "Factures émises", value: integer(m.count), color: COLORS.count }],
);

export function CountChart({ months }: { months: MonthStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="short" {...commonAxis.x} />
        <YAxis {...commonAxis.y} width={32} allowDecimals={false} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} content={<CountTooltip />} />
        <Bar dataKey="count" fill={COLORS.count} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const AverageTooltip = makeTooltip<MonthStat>(
  (m) => m.label,
  (m) => [
    { label: "Panier moyen", value: eur(m.average), color: COLORS.net },
    { label: "Factures", value: integer(m.count) },
  ],
);

export function AverageChart({ months }: { months: MonthStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="short" {...commonAxis.x} />
        <YAxis {...commonAxis.y} tickFormatter={compactEur} domain={[0, "auto"]} />
        <Tooltip cursor={{ stroke: "#cbd5e1" }} content={<AverageTooltip />} />
        <Line
          type="monotone"
          dataKey="average"
          stroke={COLORS.net}
          strokeWidth={2}
          dot={{ r: 3, fill: COLORS.net, stroke: "#fff", strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

const CommissionTooltip = makeTooltip<MonthStat>(
  (m) => m.label,
  (m) => [
    { label: "Commissions", value: eur(m.commission), color: COLORS.commission },
    { label: "Taux moyen", value: pct(m.rate) },
    { label: "Retenues", value: eur(m.retained) },
  ],
);

export function CommissionChart({ months }: { months: MonthStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="short" {...commonAxis.x} />
        <YAxis {...commonAxis.y} tickFormatter={compactEur} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} content={<CommissionTooltip />} />
        <Bar dataKey="commission" fill={COLORS.commission} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

type Group = Stats["weekdays"][number];

const GroupTooltip = makeTooltip<Group>(
  (g) => g.label,
  (g) => [
    { label: "Factures", value: integer(g.count), color: COLORS.count },
    { label: "Chiffre d'affaires", value: eur(g.revenue) },
  ],
);

export function WeekdayChart({ weekdays }: { weekdays: Group[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={weekdays} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" {...commonAxis.x} />
        <YAxis {...commonAxis.y} width={32} allowDecimals={false} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} content={<GroupTooltip />} />
        <Bar dataKey="count" fill={COLORS.count} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Répartition par tranche de montant : barres horizontales avec valeur en clair. */
export function BucketList({ buckets }: { buckets: Group[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((t, b) => t + b.count, 0) || 1;
  return (
    <div className="flex flex-col gap-4 px-5 pb-5 pt-4">
      {buckets.map((bucket) => (
        <div key={bucket.label} title={`${bucket.count} factures · ${eur(bucket.revenue)}`}>
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="font-medium text-slate-700">{bucket.label}</span>
            <span className="tabular text-slate-500">
              <span className="font-semibold text-slate-900">{bucket.count}</span> ·{" "}
              {Math.round((bucket.count / total) * 100)} %
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full"
              style={{ width: `${(bucket.count / max) * 100}%`, background: COLORS.revenue, minWidth: bucket.count ? 4 : 0 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
