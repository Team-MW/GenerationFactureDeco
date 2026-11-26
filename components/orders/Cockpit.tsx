"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RankList } from "@/components/orders/SalesCharts";
import { Card, CardHeader } from "@/components/ui";
import { compactEur, dateFr, eur, eur0 } from "@/lib/format";
import { RANGES, analyse, type Bucket, type Facts, type Grain, type RangeId, type Rank, type Totals } from "@/lib/orders/cockpit";
import { DELIVERY_MODES } from "@/lib/orders/logic";
import type { DeliveryMode } from "@/lib/orders/types";

// Palette vérifiée (daltonisme, contraste) : une couleur par série, toujours la même.
const BLUE = "#257de0";
const ORANGE = "#f47230";
const AQUA = "#00b894";
const MUTED = "#b8bcc4";
const GRID = "#e7e7e7";
const AXIS = { fontSize: 11, fill: "#666666" };
const GRAINS: { id: Grain; label: string }[] = [
  { id: "jour", label: "Par jour" },
  { id: "semaine", label: "Par semaine" },
  { id: "mois", label: "Par mois" },
];
const GRAIN_NOUN: Record<Grain, string> = { jour: "jour", semaine: "semaine", mois: "mois" };
const int = (n: number) => n.toLocaleString("fr-FR");
const plural = (n: number, word: string) => `${int(n)} ${word}${n > 1 ? "s" : ""}`;
const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)} %` : "–");

/* ---------- Petites briques ---------- */

function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${o.id === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Delta({ current, previous, neutral }: { current: number; previous: number | undefined; neutral?: boolean }) {
  if (previous === undefined) return null;
  if (!previous) return <span className="text-slate-400">{current ? "rien sur la période d'avant" : "comme la période d'avant"}</span>;
  const change = (current - previous) / previous;
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const tone = neutral ? "bg-slate-100 text-slate-700" : up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium ${tone}`}>
        <Icon size={12} />
        {up ? "+" : "−"}
        {Math.abs(change * 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %
      </span>
      <span className="text-slate-400">vs période d&apos;avant</span>
    </span>
  );
}

/** Mini-courbe : la forme de la période, sans axe ni chiffre. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2 || values.every((v) => v === 0)) return <div className="h-7" />;
  const max = Math.max(...values), min = Math.min(0, ...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 120},${26 - ((v - min) / span) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
      <polyline points={points} fill="none" stroke={BLUE} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Tile({ label, value, spark, children }: { label: string; value: string; spark?: number[]; children?: React.ReactNode }) {
  return (
    <Card className="flex flex-col px-4 py-3.5 md:px-5 md:py-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:text-xs">{label}</div>
      <div className="mt-2 text-xl font-semibold leading-none tracking-tight text-slate-900 md:text-[26px]">{value}</div>
      <div className="mt-2.5 min-h-5 text-xs text-slate-500">{children}</div>
      {spark ? <div className="mt-auto pt-2"><Sparkline values={spark} /></div> : null}
    </Card>
  );
}

function Legend({ items }: { items: { label: string; color: string; line?: boolean; detail?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pt-2 text-xs text-slate-600">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={item.line ? "h-0.5 w-3.5 rounded-full" : "h-2.5 w-2.5 rounded-sm"} style={{ background: item.color }} />
          {item.label}
          {item.detail ? <span className="tabular text-slate-400">{item.detail}</span> : null}
        </span>
      ))}
    </div>
  );
}

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

const bucketTitle = (b: Bucket) => b.label;
const SalesTip = tooltipOf<Bucket>(bucketTitle, (b) => [
  { label: "Ventes TTC", value: eur(b.revenue), color: BLUE },
  { label: "Commandes", value: int(b.count) },
  { label: "Panier moyen", value: b.count ? eur(b.average) : "–" },
  { label: "Articles vendus", value: int(b.units) },
]);
const CumulTip = tooltipOf<Bucket>(bucketTitle, (b) => [
  { label: "Cumul de la période", value: eur(b.cumulative), color: BLUE },
  ...(b.previousCumulative === null ? [] : [{ label: "Période d'avant, au même point", value: eur(b.previousCumulative), color: MUTED }]),
]);
const CashTip = tooltipOf<Bucket>(bucketTitle, (b) => [
  { label: "Espèces", value: eur(b.especes), color: BLUE },
  { label: "Carte bancaire", value: eur(b.carte), color: ORANGE },
  { label: "Virement", value: eur(b.virement), color: AQUA },
  ...(b.autre ? [{ label: "Non précisé", value: eur(b.autre), color: MUTED }] : []),
  { label: "Total encaissé", value: eur(b.collected) },
]);
const CountTip = tooltipOf<Bucket>(bucketTitle, (b) => [
  { label: "Commandes", value: int(b.count), color: BLUE },
  { label: "Ventes TTC", value: eur(b.revenue) },
]);
const BasketTip = tooltipOf<Bucket>(bucketTitle, (b) => [
  { label: "Panier moyen", value: b.count ? eur(b.average) : "aucune commande", color: BLUE },
  { label: "Commandes", value: int(b.count) },
]);
const MarginTip = tooltipOf<Bucket>(bucketTitle, (b) => [
  { label: "Marge brute HT", value: eur(b.profit), color: BLUE },
  { label: "Taux de marge", value: percent(b.profit, b.costedHt) },
  { label: "Ventes HT dont le coût est connu", value: eur(b.costedHt) },
]);
const DeliveredTip = tooltipOf<Bucket>(bucketTitle, (b) => [{ label: "Livraisons et retraits effectués", value: int(b.delivered), color: BLUE }]);
const HourTip = tooltipOf<Rank>(
  (h) => `De ${h.label.replace(" h", "")} h à ${Number(h.label.replace(" h", "")) + 1} h`,
  (h) => [
    { label: "Ventes TTC", value: eur(h.value), color: BLUE },
    { label: "Commandes", value: int(h.count) },
  ],
);

const X = { dataKey: "short", tickLine: false, axisLine: { stroke: "#c2c2c2" }, tick: AXIS, tickMargin: 8, minTickGap: 14 };
const Y = { tickLine: false, axisLine: false, tick: AXIS };
const CURSOR = { fill: "#f1f5f9" };
const LINE_CURSOR = { stroke: "#c2c2c2", strokeWidth: 1 };
const MARGIN = { top: 8, right: 12, left: 0, bottom: 0 };

function ChartCard({ title, hint, legend, children, className = "" }: { title: string; hint?: string; legend?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title={title} hint={hint} />
      {legend}
      <div className="px-3 pb-4 pt-3">{children}</div>
    </Card>
  );
}

function Empty({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>
      Aucune donnée sur cette période.
    </div>
  );
}

/* ---------- Le cockpit ---------- */

export default function Cockpit({ facts, marginKnown }: { facts: Facts; marginKnown: boolean }) {
  const [range, setRange] = useState<RangeId>("30j");
  const [grain, setGrain] = useState<Grain>("jour");
  const a = useMemo(() => analyse(facts, range, grain), [facts, range, grain]);
  const { totals: t, previous: p, buckets } = a;
  const noun = GRAIN_NOUN[a.grain];
  const each = a.grain === "semaine" ? "Chaque semaine" : `Chaque ${noun}`;

  const pickRange = (id: RangeId) => {
    setRange(id);
    setGrain(RANGES.find((r) => r.id === id)!.grain);
  };

  const series = (key: "revenue" | "count" | "average" | "collected" | "profit" | "units" | "discount") => buckets.map((b) => b[key]);
  const hasSales = t.count > 0;
  const hasCash = t.collected > 0;
  const hasMargin = marginKnown && t.costedHt > 0;
  const hasDelivered = buckets.some((b) => b.delivered > 0);
  const delivered = buckets.reduce((n, b) => n + b.delivered, 0);

  // Heures : de l'ouverture à la fermeture, élargies si une vente tombe en dehors.
  const active = a.hours.map((h, i) => (h.count ? i : -1)).filter((i) => i >= 0);
  const hours = a.hours.slice(Math.min(9, ...active), Math.max(19, ...active) + 1).map((h) => ({ ...h, short: h.label }));
  const bestHour = a.hours.reduce((x, y) => (y.value > x.value ? y : x));
  const bestDay = a.weekdays.reduce((x, y) => (y.value > x.value ? y : x));

  const rank = (rows: Rank[], detail: (r: Rank) => string) => rows.map((r) => ({ label: r.label, value: r.value, detail: detail(r) }));
  const modeRows = (Object.keys(DELIVERY_MODES) as DeliveryMode[]).map((mode) => ({ label: DELIVERY_MODES[mode].label, value: a.modes[mode], detail: `${a.modes[mode]} · ${percent(a.modes[mode], t.count)}` }));
  const rows = [...buckets].reverse().filter((b) => b.count || b.collected || b.delivered);

  return (
    <>
      {/* Un seul filtre, au-dessus de tout ce qu'il pilote. */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 bg-slate-50/95 px-1 py-2 backdrop-blur">
        <Segmented label="Période" options={RANGES} value={range} onChange={pickRange} />
        <Segmented label="Découpage" options={GRAINS} value={a.grain} onChange={setGrain} />
        <span className="text-xs text-slate-500">
          Du {dateFr(a.period.start)} au {dateFr(a.period.end)}
          {a.grain !== grain ? " · période trop longue pour ce découpage, affichage au niveau supérieur" : ""}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Tile label="Ventes TTC" value={eur0(t.revenue)} spark={series("revenue")}>
          <Delta current={t.revenue} previous={p?.revenue} />
        </Tile>
        <Tile label="Commandes" value={int(t.count)} spark={series("count")}>
          <Delta current={t.count} previous={p?.count} />
          {t.cancelled ? <div className="mt-1 text-slate-400">{plural(t.cancelled, "annulée")} non comptée{t.cancelled > 1 ? "s" : ""}</div> : null}
        </Tile>
        <Tile label="Panier moyen" value={t.count ? eur0(t.average) : "–"} spark={series("average")}>
          <Delta current={t.average} previous={p?.count ? p.average : undefined} />
        </Tile>
        <Tile label="Encaissé" value={eur0(t.collected)} spark={series("collected")}>
          <Delta current={t.collected} previous={p?.collected} />
        </Tile>
        <Tile label="Marge brute HT" value={hasMargin ? eur0(t.profit) : "–"} spark={hasMargin ? series("profit") : undefined}>
          {hasMargin ? (
            <>
              {percent(t.profit, t.costedHt)} de marge · calculée sur {percent(t.costedHt, t.articlesHt)} des ventes
            </>
          ) : (
            "Renseignez les prix d'achat dans « Coûts & marges » pour la voir."
          )}
        </Tile>
        <Tile label="Articles vendus" value={int(t.units)} spark={series("units")}>
          <Delta current={t.units} previous={p?.units} />
        </Tile>
        <Tile label="Remises accordées" value={eur0(t.discount)} spark={series("discount")}>
          <Delta current={t.discount} previous={p?.discount} neutral />
        </Tile>
        <Tile label="Clients" value={int(t.newCustomers + t.returningCustomers)}>
          {t.newCustomers} nouveau{t.newCustomers > 1 ? "x" : ""} · {t.returningCustomers} déjà client{t.returningCustomers > 1 ? "s" : ""}
        </Tile>
      </div>

      <Card className="mt-3 grid grid-cols-2 divide-slate-100 md:mt-4 lg:grid-cols-5 lg:divide-x">
        {[
          ["Reste à encaisser", eur(t.rest), "sur les commandes de la période"],
          [`Meilleur${a.grain === "semaine" ? "e" : ""} ${noun}`, a.best ? a.best.label : "–", a.best ? eur0(a.best.revenue) : "aucune vente"],
          ["Meilleur jour de la semaine", hasSales ? bestDay.label : "–", hasSales ? `${eur0(bestDay.value)} · ${plural(bestDay.count, "commande")}` : "aucune vente"],
          ["Livraisons et retraits effectués", int(delivered), a.leadTime ? `${a.leadTime.days.toLocaleString("fr-FR")} jour${a.leadTime.days >= 2 ? "s" : ""} en moyenne après la commande` : "aucun sur la période"],
          ["Livraisons facturées", eur(t.delivery), `${plural(t.offered, "livraison")} offerte${t.offered > 1 ? "s" : ""}`],
        ].map(([label, value, hint]) => (
          <div key={label} className="px-5 py-3.5">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-0.5 text-base font-semibold text-slate-900">{value}</div>
            <div className="text-xs text-slate-400">{hint}</div>
          </div>
        ))}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title={`Ventes par ${noun}`} hint="Total TTC des commandes, à leur date de création">
          {hasSales ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={buckets} margin={MARGIN}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis {...X} />
                <YAxis {...Y} width={52} tickFormatter={compactEur} />
                <Tooltip cursor={CURSOR} content={<SalesTip />} />
                <Bar dataKey="revenue" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty height={300} />
          )}
        </ChartCard>
        <ChartCard
          title="Cumul des ventes"
          hint="Où en est la période, comparée à la précédente"
          legend={<Legend items={[{ label: "Cette période", color: BLUE, line: true, detail: eur0(t.revenue) }, ...(p ? [{ label: "Période d'avant", color: MUTED, line: true, detail: eur0(p.revenue) }] : [])]} />}
        >
          {hasSales || p?.revenue ? (
            <ResponsiveContainer width="100%" height={270}>
              <ComposedChart data={buckets} margin={MARGIN}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis {...X} />
                <YAxis {...Y} width={52} tickFormatter={compactEur} />
                <Tooltip cursor={LINE_CURSOR} content={<CumulTip />} />
                {p ? <Line dataKey="previousCumulative" stroke={MUTED} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} /> : null}
                <Area dataKey="cumulative" stroke={BLUE} strokeWidth={2} fill={BLUE} fillOpacity={0.1} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <Empty height={270} />
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title={`Encaissements par ${noun}`}
          hint="L'argent réellement reçu, à la date du paiement (acomptes et soldes)"
          legend={
            <Legend
              items={[
                { label: "Espèces", color: BLUE, detail: eur0(a.methods.especes) },
                { label: "Carte bancaire", color: ORANGE, detail: eur0(a.methods.carte) },
                { label: "Virement", color: AQUA, detail: eur0(a.methods.virement) },
                ...(a.methods.autre ? [{ label: "Non précisé", color: MUTED, detail: eur0(a.methods.autre) }] : []),
              ]}
            />
          }
        >
          {hasCash ? (
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={buckets} margin={MARGIN}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis {...X} />
                <YAxis {...Y} width={52} tickFormatter={compactEur} />
                <Tooltip cursor={CURSOR} content={<CashTip />} />
                {(
                  [
                    ["especes", BLUE],
                    ["carte", ORANGE],
                    ["virement", AQUA],
                    ["autre", MUTED],
                  ] as const
                ).map(([key, color]) => (
                  <Bar key={key} dataKey={key} stackId="cash" fill={color} stroke="#fff" strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty height={270} />
          )}
        </ChartCard>
        <ChartCard title={`Panier moyen par ${noun}`} hint="Montant moyen d'une commande">
          {hasSales ? (
            <ResponsiveContainer width="100%" height={270}>
              <LineChart data={buckets} margin={MARGIN}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis {...X} />
                <YAxis {...Y} width={52} tickFormatter={compactEur} />
                <Tooltip cursor={LINE_CURSOR} content={<BasketTip />} />
                <Line dataKey={(b: Bucket) => (b.count ? b.average : null)} connectNulls stroke={BLUE} strokeWidth={2} dot={{ r: 3, fill: BLUE, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty height={270} />
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title={`Commandes par ${noun}`} hint="Nombre de bons de commande">
          {hasSales ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={buckets} margin={MARGIN}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis {...X} />
                <YAxis {...Y} width={30} allowDecimals={false} />
                <Tooltip cursor={CURSOR} content={<CountTip />} />
                <Bar dataKey="count" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty height={220} />
          )}
        </ChartCard>
        <ChartCard title={`Marge brute par ${noun}`} hint="Hors taxes, sur les articles dont le prix d'achat est connu">
          {hasMargin ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={buckets} margin={MARGIN}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis {...X} />
                <YAxis {...Y} width={52} tickFormatter={compactEur} />
                <Tooltip cursor={CURSOR} content={<MarginTip />} />
                <Bar dataKey="profit" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[220px] items-center justify-center px-6 text-center text-sm text-slate-400">Aucun article vendu sur la période n&apos;a de prix d&apos;achat renseigné.</div>
          )}
        </ChartCard>
        <ChartCard title={`Livraisons effectuées par ${noun}`} hint="Livraisons et retraits terminés, à leur date réelle">
          {hasDelivered ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={buckets} margin={MARGIN}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis {...X} />
                <YAxis {...Y} width={30} allowDecimals={false} />
                <Tooltip cursor={CURSOR} content={<DeliveredTip />} />
                <Bar dataKey="delivered" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty height={220} />
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Ventes par jour de la semaine" hint="Quels jours le magasin vend le plus" />
          <RankList rows={rank(a.weekdays, (r) => `${r.count} cde${r.count > 1 ? "s" : ""} · ${eur0(r.value)}`)} empty="" />
        </Card>
        <ChartCard className="lg:col-span-2" title="Ventes par heure de la journée" hint={hasSales ? `Heure la plus forte : de ${bestHour.label.replace(" h", "")} h à ${Number(bestHour.label.replace(" h", "")) + 1} h (${eur0(bestHour.value)}, ${plural(bestHour.count, "commande")})` : "Heure de création des commandes"}>
          {hasSales ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={hours} margin={MARGIN}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis {...X} />
                  <YAxis {...Y} width={52} tickFormatter={compactEur} />
                  <Tooltip cursor={CURSOR} content={<HourTip />} />
                  <Bar dataKey="value" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
              <details className="px-2 pt-2 text-xs text-slate-600">
                <summary className="cursor-pointer text-slate-500">Voir les chiffres</summary>
                <div className="tabular mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                  {hours.filter((h) => h.count).map((h) => (
                    <div key={h.label} className="flex justify-between gap-3">
                      <span>{h.label}</span>
                      <span className="text-slate-900">
                        {eur0(h.value)} · {h.count}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            </>
          ) : (
            <Empty height={250} />
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Articles les plus vendus" hint="Classés par chiffre d'affaires, remises déduites" />
          <RankList rows={rank(a.articles, (r) => `${r.count} vendu${r.count > 1 ? "s" : ""} · ${eur0(r.value)}`)} empty="Aucun article vendu sur la période." />
        </Card>
        <Card>
          <CardHeader title="Ventes par famille de produits" hint="Canapés, tables, tapis…" />
          <RankList rows={rank(a.categories, (r) => `${r.count} pièce${r.count > 1 ? "s" : ""} · ${eur0(r.value)} · ${percent(r.value, a.categories.reduce((s, c) => s + c.value, 0))}`)} empty="Aucun article vendu sur la période." />
        </Card>
        <Card>
          <CardHeader title="Meilleurs clients" hint="Total commandé sur la période" />
          <RankList rows={rank(a.customers, (r) => `${r.count} cde${r.count > 1 ? "s" : ""} · ${eur0(r.value)}`)} empty="Aucune commande sur la période." />
        </Card>
        <Card>
          <CardHeader title="Villes des clients" hint="D'où viennent les commandes" />
          <RankList rows={rank(a.cities, (r) => `${r.count} cde${r.count > 1 ? "s" : ""} · ${eur0(r.value)}`)} empty="Aucune commande sur la période." />
        </Card>
        <Card>
          <CardHeader title="Formules de livraison" hint="Répartition des commandes" />
          <RankList rows={modeRows} empty="" />
        </Card>
        <Card>
          <CardHeader title="Moyens de paiement" hint="Part de chaque moyen dans l'argent encaissé" />
          <RankList
            rows={[
              { label: "Espèces", value: a.methods.especes, detail: `${eur0(a.methods.especes)} · ${percent(a.methods.especes, t.collected)}` },
              { label: "Carte bancaire", value: a.methods.carte, detail: `${eur0(a.methods.carte)} · ${percent(a.methods.carte, t.collected)}` },
              { label: "Virement", value: a.methods.virement, detail: `${eur0(a.methods.virement)} · ${percent(a.methods.virement, t.collected)}` },
              ...(a.methods.autre ? [{ label: "Non précisé", value: a.methods.autre, detail: `${eur0(a.methods.autre)} · ${percent(a.methods.autre, t.collected)}` }] : []),
            ]}
            empty=""
          />
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader title={`Tous les chiffres, ${noun} par ${noun}`} hint={`${each} où il s'est passé quelque chose, du plus récent au plus ancien`} />
        <div className="mt-3 max-h-[520px] overflow-auto">
          <table className="tabular w-full min-w-[760px] text-sm">
            <thead className="sticky top-0">
              <tr className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5 text-left font-medium">Période</th>
                <th className="px-3 py-2.5 text-right font-medium">Commandes</th>
                <th className="px-3 py-2.5 text-right font-medium">Ventes TTC</th>
                <th className="px-3 py-2.5 text-right font-medium">Panier moyen</th>
                <th className="px-3 py-2.5 text-right font-medium">Articles</th>
                <th className="px-3 py-2.5 text-right font-medium">Encaissé</th>
                <th className="px-3 py-2.5 text-right font-medium">Marge brute HT</th>
                <th className="px-5 py-2.5 text-right font-medium">Livraisons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((b) => (
                <tr key={b.key}>
                  <td className="whitespace-nowrap px-5 py-2.5 font-medium text-slate-900">{b.label}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{b.count}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-900">{eur(b.revenue)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{b.count ? eur(b.average) : "–"}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{b.units}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{eur(b.collected)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{b.costedHt > 0 ? `${eur(b.profit)} · ${percent(b.profit, b.costedHt)}` : "–"}</td>
                  <td className="px-5 py-2.5 text-right text-slate-600">{b.delivered}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    Rien sur cette période.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {rows.length > 1 ? (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-5 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right">{t.count}</td>
                  <td className="px-3 py-2.5 text-right">{eur(t.revenue)}</td>
                  <td className="px-3 py-2.5 text-right">{t.count ? eur(t.average) : "–"}</td>
                  <td className="px-3 py-2.5 text-right">{t.units}</td>
                  <td className="px-3 py-2.5 text-right">{eur(t.collected)}</td>
                  <td className="px-3 py-2.5 text-right">{t.costedHt > 0 ? `${eur(t.profit)} · ${percent(t.profit, t.costedHt)}` : "–"}</td>
                  <td className="px-5 py-2.5 text-right">{delivered}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>
    </>
  );
}
