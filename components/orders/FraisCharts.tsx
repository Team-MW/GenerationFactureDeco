"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactEur, eur } from "@/lib/format";

// Même palette vérifiée que le cockpit des ventes.
const BLUE = "#257de0";
const ORANGE = "#f47230";
const RED = "#dc3c3d";
const GRID = "#e7e7e7";
const AXIS = { fontSize: 11, fill: "#666666" };
const MARGIN = { top: 12, right: 16, left: 0, bottom: 0 };

interface Row {
  label: string;
  value: string;
  color?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function tooltipOf<T>(title: (d: T) => string, rows: (d: T) => Row[]) {
  return function ChartTooltip({ active, payload }: any) {
    const datum: T | undefined = payload?.[0]?.payload;
    if (!active || !datum) return null;
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
        <div className="mb-1 font-semibold text-slate-900">{title(datum)}</div>
        {rows(datum).map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-6 py-0.5">
            <span className="flex items-center gap-1.5 text-slate-500">
              {row.color ? <span className="h-0.5 w-3 rounded-full" style={{ background: row.color }} /> : null}
              {row.label}
            </span>
            <span className="tabular font-semibold text-slate-900">{row.value}</span>
          </div>
        ))}
      </div>
    );
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pt-2 text-xs text-slate-600">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={item.line ? "h-0.5 w-3.5 rounded-full" : "h-2.5 w-2.5 rounded-sm"} style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export interface BreakEvenPoint {
  revenue: number;
  margin: number;
  charges: number;
}

const BreakEvenTip = tooltipOf<BreakEvenPoint>(
  (p) => `${eur(p.revenue)} HT de ventes dans le mois`,
  (p) => [
    { label: "Marge brute gagnée", value: eur(p.margin), color: BLUE },
    { label: "Charges fixes à payer", value: eur(p.charges), color: ORANGE },
    { label: p.margin >= p.charges ? "Bénéfice" : "Perte", value: eur(Math.abs(p.margin - p.charges)) },
  ],
);

/** Le graphique du seuil de rentabilité : la marge monte avec les ventes, les charges ne bougent pas ; elles se croisent au seuil. */
export function BreakEvenChart({ points, breakEven, target }: { points: BreakEvenPoint[]; breakEven: number; target: number }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={points} margin={MARGIN}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="revenue" type="number" domain={[0, "dataMax"]} tickLine={false} axisLine={{ stroke: "#c2c2c2" }} tick={AXIS} tickMargin={8} tickFormatter={compactEur} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} width={52} tickFormatter={compactEur} />
        <Tooltip cursor={{ stroke: "#c2c2c2", strokeWidth: 1 }} content={<BreakEvenTip />} />
        <ReferenceLine x={breakEven} stroke="#0f172a" strokeWidth={1} label={{ value: `Seuil : ${compactEur(breakEven)}`, position: "insideTopLeft", fontSize: 11, fill: "#0f172a" }} />
        {target > 0 && Math.abs(target - breakEven) / breakEven > 0.04 ? <ReferenceLine x={target} stroke="#94a3b8" strokeWidth={1} label={{ value: `Objectif : ${compactEur(target)}`, position: "insideLeft", fontSize: 11, fill: "#475569" }} /> : null}
        <Line dataKey="charges" stroke={ORANGE} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
        <Line dataKey="margin" stroke={BLUE} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface MonthPoint {
  short: string;
  label: string;
  revenueHt: number;
  /** Marge brute estimée (ventes HT × marge visée) moins les charges fixes du mois. */
  result: number | null;
  count: number;
}

const MonthTip = tooltipOf<MonthPoint>(
  (m) => m.label,
  (m) => [
    { label: "Ventes HT", value: eur(m.revenueHt), color: BLUE },
    { label: "Commandes", value: String(m.count) },
    ...(m.result === null ? [] : [{ label: m.result >= 0 ? "Bénéfice estimé" : "Perte estimée", value: eur(Math.abs(m.result)) }]),
  ],
);

/** Ventes HT de chaque mois face au seuil de rentabilité (trait noir). */
export function MonthlyVsBreakEven({ months, breakEven }: { months: MonthPoint[]; breakEven: number }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={months} margin={MARGIN}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="short" tickLine={false} axisLine={{ stroke: "#c2c2c2" }} tick={AXIS} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} width={52} tickFormatter={compactEur} domain={[0, (max: number) => Math.max(max, breakEven * 1.1)]} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} content={<MonthTip />} />
        <Bar dataKey="revenueHt" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        {breakEven > 0 ? <ReferenceLine y={breakEven} stroke="#0f172a" strokeWidth={1} label={{ value: `Seuil de rentabilité : ${compactEur(breakEven)} HT`, position: "insideTopLeft", fontSize: 11, fill: "#0f172a" }} /> : null}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Résultat estimé de chaque mois : au-dessus de zéro le magasin gagne, en dessous il perd. */
export function MonthlyResult({ months }: { months: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={months} margin={MARGIN}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="short" tickLine={false} axisLine={false} tick={AXIS} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} width={56} tickFormatter={compactEur} domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} content={<MonthTip />} />
        <ReferenceLine y={0} stroke="#c2c2c2" />
        <Bar dataKey="result" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {months.map((m) => (
            <Cell key={m.short} fill={(m.result ?? 0) >= 0 ? BLUE : RED} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
