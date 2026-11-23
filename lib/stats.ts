import { monthLabel, monthShort } from "./format";
import type { Dataset, MonthStat, Stats } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "< 500 €", min: 0, max: 500 },
  { label: "500 – 1 000 €", min: 500, max: 1000 },
  { label: "1 000 – 1 500 €", min: 1000, max: 1500 },
  { label: "1 500 – 2 000 €", min: 1500, max: 2000 },
  { label: "≥ 2 000 €", min: 2000, max: Infinity },
];

// Lundi en premier
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function computeStats({ invoices, retentions }: Dataset): Stats {
  const byMonth = new Map<string, MonthStat>();
  const monthOf = (month: string) => {
    let stat = byMonth.get(month);
    if (!stat) {
      stat = {
        month,
        label: monthLabel(month),
        short: monthShort(month),
        count: 0,
        revenue: 0,
        commission: 0,
        retained: 0,
        net: 0,
        average: 0,
        rate: 0,
        cumulative: 0,
      };
      byMonth.set(month, stat);
    }
    return stat;
  };

  const buckets = BUCKETS.map((b) => ({ label: b.label, count: 0, revenue: 0 }));
  const weekdays = WEEKDAYS.map((label) => ({ label, count: 0, revenue: 0 }));

  for (const invoice of invoices) {
    const stat = monthOf(invoice.month);
    stat.count += 1;
    stat.revenue += invoice.amount;
    stat.commission += invoice.commission;
    stat.retained += invoice.retained;
    stat.net += invoice.net;

    const bucket = BUCKETS.findIndex((b) => invoice.amount >= b.min && invoice.amount < b.max);
    if (bucket >= 0) {
      buckets[bucket].count += 1;
      buckets[bucket].revenue += invoice.amount;
    }
    const day = (new Date(`${invoice.date}T00:00:00Z`).getUTCDay() + 6) % 7;
    weekdays[day].count += 1;
    weekdays[day].revenue += invoice.amount;
  }
  for (const retention of retentions) {
    const stat = monthOf(retention.month);
    stat.retained += retention.amount;
    stat.net -= retention.amount;
  }

  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  let cumulative = 0;
  for (const stat of months) {
    cumulative += stat.revenue;
    stat.revenue = round2(stat.revenue);
    stat.commission = round2(stat.commission);
    stat.retained = round2(stat.retained);
    stat.net = round2(stat.net);
    stat.average = stat.count ? round2(stat.revenue / stat.count) : 0;
    stat.rate = stat.revenue ? stat.commission / stat.revenue : 0;
    stat.cumulative = round2(cumulative);
  }
  for (const b of [...buckets, ...weekdays]) b.revenue = round2(b.revenue);

  const sum = (pick: (m: MonthStat) => number) => round2(months.reduce((t, m) => t + pick(m), 0));
  const revenue = sum((m) => m.revenue);
  const commission = sum((m) => m.commission);
  const amounts = invoices.map((i) => i.amount).sort((a, b) => a - b);
  const mid = Math.floor(amounts.length / 2);
  const median = amounts.length
    ? amounts.length % 2
      ? amounts[mid]
      : (amounts[mid - 1] + amounts[mid]) / 2
    : 0;

  const withSales = months.filter((m) => m.count > 0);
  return {
    count: invoices.length,
    revenue,
    commission,
    retained: sum((m) => m.retained),
    net: sum((m) => m.net),
    average: invoices.length ? round2(revenue / invoices.length) : 0,
    median: round2(median),
    rate: revenue ? commission / revenue : 0,
    clients: new Set(invoices.map((i) => i.client.toLowerCase())).size,
    months,
    best: withSales.reduce<MonthStat | null>((best, m) => (!best || m.revenue > best.revenue ? m : best), null),
    last: withSales.at(-1) ?? null,
    previous: withSales.at(-2) ?? null,
    buckets,
    weekdays,
    top: [...invoices].sort((a, b) => b.amount - a.amount).slice(0, 6),
    recent: [...invoices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
  };
}
