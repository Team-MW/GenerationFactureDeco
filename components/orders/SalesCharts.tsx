"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactEur, eur } from "@/lib/format";

export interface SalesMonth {
  month: string;
  short: string;
  label: string;
  revenue: number;
  paid: number;
  count: number;
  average: number;
}

const BLUE = "#2a78d6";
const VIOLET = "#6250d6";
const GRID = "#eef1f5";
const AXIS = { fontSize: 11, fill: "#64748b" };

/* eslint-disable @typescript-eslint/no-explicit-any */
function MonthTooltip({ active, payload }: any) {
  const m: SalesMonth | undefined = payload?.[0]?.payload;
  if (!active || !m) return null;
  const rows: [string, string][] = [
    ["Ventes", eur(m.revenue)],
    ["Encaissé", eur(m.paid)],
    ["Commandes", String(m.count)],
    ["Panier moyen", eur(m.average)],
  ];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-slate-900">{m.label}</div>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-6 py-0.5">
          <span className="text-slate-500">{label}</span>
          <span className="tabular font-medium text-slate-900">{value}</span>
        </div>
      ))}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function MonthlyChart({ months, measure }: { months: SalesMonth[]; measure: "revenue" | "count" }) {
  const money = measure === "revenue";
  return (
    <ResponsiveContainer width="100%" height={money ? 290 : 220}>
      <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="short" tickLine={false} axisLine={{ stroke: "#e2e8f0" }} tick={AXIS} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} width={money ? 52 : 32} allowDecimals={false} tickFormatter={money ? compactEur : undefined} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} content={<MonthTooltip />} />
        <Bar dataKey={measure} fill={money ? BLUE : VIOLET} radius={[4, 4, 0, 0]} maxBarSize={money ? 36 : 28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Classement en barres horizontales, valeur écrite en clair à droite. */
export function RankList({ rows, empty }: { rows: { label: string; value: number; detail: string }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="px-5 py-8 text-sm text-slate-500">{empty}</p>;
  return (
    <div className="flex flex-col gap-4 px-5 pb-5 pt-4">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium text-slate-700">{row.label}</span>
            <span className="tabular shrink-0 text-slate-500">{row.detail}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full" style={{ width: `${(row.value / max) * 100}%`, background: BLUE, minWidth: row.value ? 4 : 0 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
