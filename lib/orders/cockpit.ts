/**
 * Cockpit des ventes : tout ce qui sert aux statistiques, sans rien qui dépende du serveur ou du navigateur.
 *  - `buildFacts` résume chaque commande une seule fois (côté serveur) ;
 *  - `analyse` découpe ces résumés par jour, semaine ou mois (côté navigateur, à chaque changement de période).
 * Les règles de calcul sont décrites dans calcule.md (section « Cockpit des ventes »).
 */
import { addDays, orderBalance, orderTotals, parisDate } from "./logic";
import type { Article, DeliveryMode, Order, PaymentMethod } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface FactLine {
  key: string;
  label: string;
  category: string;
  quantity: number;
  /** Chiffre d'affaires TTC de la ligne, remise de la commande déduite. */
  revenue: number;
}

/** Une commande non annulée, réduite à ce qu'il faut pour les statistiques. */
export interface Fact {
  /** Jour (AAAA-MM-JJ) et heure de création, à Paris. */
  day: string;
  hour: number;
  total: number;
  discount: number;
  delivery: number;
  rest: number;
  mode: DeliveryMode;
  offered: boolean;
  /** Jour où la commande a été livrée ou retirée, sinon null. */
  doneDay: string | null;
  city: string;
  customer: string;
  customerName: string;
  units: number;
  /** Ventes d'articles hors taxes, dont la part dont on connaît le coût de revient, et la marge brute sur cette part. */
  articlesHt: number;
  costedHt: number;
  profit: number;
  lines: FactLine[];
}

export interface PaymentFact {
  day: string;
  amount: number;
  method: PaymentMethod;
}

export interface Facts {
  today: string;
  sales: Fact[];
  payments: PaymentFact[];
  /** Jour de création des commandes annulées. */
  cancelled: string[];
}

const parisHour = (iso: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)));

export function buildFacts(orders: Order[], articles: Article[], vatRate: number, today: string): Facts {
  const categories = new Map(articles.map((a) => [a.id, a.category]));
  const ht = 1 + vatRate / 100;
  const facts: Facts = { today, sales: [], payments: [], cancelled: [] };

  for (const order of orders) {
    const day = parisDate(order.createdAt);
    if (order.status === "cancelled") {
      facts.cancelled.push(day);
      continue;
    }
    const totals = orderTotals(order);
    const balance = orderBalance(order);
    // La remise de la commande est répartie sur ses articles, au prorata de leur prix.
    const kept = totals.subtotal > 0 ? (totals.subtotal - totals.discount) / totals.subtotal : 1;
    let units = 0, articlesHt = 0, costedHt = 0, profit = 0;
    const lines: FactLine[] = [];
    for (const line of order.lines) {
      const sold = line.unitPrice * line.quantity * kept;
      const soldHt = sold / ht;
      units += line.quantity;
      articlesHt += soldHt;
      if (line.unitCost && line.unitCost > 0) {
        costedHt += soldHt;
        // Même définition que dans « Coûts & marges » : prix HT − coût de revient − frais de vente.
        profit += soldHt * (1 - (line.salesRate ?? 0)) - line.unitCost * line.quantity;
      }
      lines.push({ key: line.articleId || line.name, label: line.name, category: categories.get(line.articleId) || "Non classé", quantity: line.quantity, revenue: round2(sold) });
    }
    const name = order.customer.name.trim();
    facts.sales.push({
      day,
      hour: parisHour(order.createdAt),
      total: totals.total,
      discount: totals.discount,
      delivery: totals.delivery,
      rest: balance.rest,
      mode: order.delivery.mode,
      offered: order.delivery.offered,
      doneDay: order.status === "done" && order.doneAt ? parisDate(order.doneAt) : null,
      city: order.customer.city.trim().toLocaleUpperCase("fr") || "Non renseignée",
      customer: order.customer.phone.replace(/\D/g, "") || name.toLocaleLowerCase("fr"),
      customerName: name,
      units,
      articlesHt: round2(articlesHt),
      costedHt: round2(costedHt),
      profit: round2(profit),
      lines,
    });

    // Encaissements à leur date réelle ; à défaut de détail, le montant réglé est daté du jour de la commande.
    const detailed = order.payments.reduce((t, p) => t + p.amount, 0);
    for (const p of order.payments) if (p.amount) facts.payments.push({ day: parisDate(p.at), amount: p.amount, method: p.method });
    const missing = round2(balance.paid - detailed);
    if (missing > 0.005) facts.payments.push({ day, amount: missing, method: "" });
  }
  return facts;
}

/* ---------- Périodes ---------- */

export type Grain = "jour" | "semaine" | "mois";
export type RangeId = "7j" | "30j" | "90j" | "12m" | "annee" | "tout";

export const RANGES: { id: RangeId; label: string; grain: Grain }[] = [
  { id: "7j", label: "7 jours", grain: "jour" },
  { id: "30j", label: "30 jours", grain: "jour" },
  { id: "90j", label: "90 jours", grain: "semaine" },
  { id: "12m", label: "12 mois", grain: "mois" },
  { id: "annee", label: "Cette année", grain: "mois" },
  { id: "tout", label: "Depuis le début", grain: "mois" },
];

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const utc = (day: string) => new Date(`${day}T12:00:00Z`);
/** 0 = lundi … 6 = dimanche. */
export const weekdayOf = (day: string) => (utc(day).getUTCDay() + 6) % 7;
const mondayOf = (day: string) => addDays(day, -weekdayOf(day));
const daysBetween = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000);

function addMonths(day: string, months: number): string {
  const d = utc(day);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return target.toISOString().slice(0, 10);
}

export interface Period {
  start: string;
  end: string;
  /** Période précédente de même durée (absente pour « Depuis le début »). */
  previous: { start: string; end: string } | null;
}

export function periodOf(range: RangeId, today: string, firstDay: string): Period {
  const before = (start: string, end: string) => {
    const length = daysBetween(start, end) + 1;
    return { start: addDays(start, -length), end: addDays(start, -1) };
  };
  switch (range) {
    case "7j":
    case "30j":
    case "90j": {
      const start = addDays(today, -(parseInt(range) - 1));
      return { start, end: today, previous: before(start, today) };
    }
    case "12m": {
      // Douze mois entiers, mois en cours compris.
      const start = `${addMonths(`${today.slice(0, 7)}-01`, -11)}`;
      return { start, end: today, previous: { start: addMonths(start, -12), end: addDays(start, -1) } };
    }
    case "annee": {
      const start = `${today.slice(0, 4)}-01-01`;
      // Même partie de l'année précédente.
      return { start, end: today, previous: { start: addMonths(start, -12), end: addMonths(today, -12) } };
    }
    case "tout":
      return { start: firstDay < today ? firstDay : today, end: today, previous: null };
  }
}

const bucketKey = (day: string, grain: Grain) => (grain === "jour" ? day : grain === "semaine" ? mondayOf(day) : day.slice(0, 7));

function bucketKeys(start: string, end: string, grain: Grain): string[] {
  const keys: string[] = [];
  if (grain === "mois") {
    for (let d = `${start.slice(0, 7)}-01`; d.slice(0, 7) <= end.slice(0, 7); d = addMonths(d, 1)) keys.push(d.slice(0, 7));
  } else {
    const step = grain === "jour" ? 1 : 7;
    for (let d = bucketKey(start, grain); d <= end; d = addDays(d, step)) keys.push(d);
  }
  return keys;
}

/** Au-delà de ce nombre de barres, le graphique devient illisible : on passe au découpage supérieur. */
const MAX_BUCKETS = 100;
export function effectiveGrain(period: Period, grain: Grain): Grain {
  if (grain === "jour" && daysBetween(period.start, period.end) + 1 > MAX_BUCKETS) grain = "semaine";
  if (grain === "semaine" && (daysBetween(period.start, period.end) + 1) / 7 > MAX_BUCKETS) grain = "mois";
  return grain;
}

function bucketLabels(key: string, grain: Grain, start: string, end: string): { short: string; label: string } {
  if (grain === "mois") {
    const [y, m] = key.split("-").map(Number);
    return { short: `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`, label: `${MONTHS[m - 1].charAt(0).toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}` };
  }
  const d = utc(key);
  const short = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  if (grain === "jour") return { short, label: `${WEEKDAYS[weekdayOf(key)]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  // Une semaine coupée par le début ou la fin de la période ne montre que les jours comptés.
  const from = key < start ? start : key;
  const to = addDays(key, 6) > end ? end : addDays(key, 6);
  const f = utc(from), t = utc(to);
  return { short, label: `Semaine du ${f.getUTCDate()}${f.getUTCMonth() === t.getUTCMonth() ? "" : ` ${MONTHS[f.getUTCMonth()]}`} au ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}` };
}

/* ---------- Analyse ---------- */

export interface Bucket {
  key: string;
  short: string;
  label: string;
  revenue: number;
  count: number;
  average: number;
  units: number;
  discount: number;
  profit: number;
  costedHt: number;
  delivered: number;
  especes: number;
  carte: number;
  virement: number;
  autre: number;
  collected: number;
  /** Ventes cumulées depuis le début de la période, et celles de la période précédente au même point. */
  cumulative: number;
  previousCumulative: number | null;
}

export interface Totals {
  revenue: number;
  count: number;
  average: number;
  units: number;
  discount: number;
  collected: number;
  profit: number;
  costedHt: number;
  articlesHt: number;
  rest: number;
  delivery: number;
  offered: number;
  cancelled: number;
  newCustomers: number;
  returningCustomers: number;
}

export interface Rank {
  label: string;
  value: number;
  count: number;
}

export interface Analysis {
  period: Period;
  grain: Grain;
  buckets: Bucket[];
  totals: Totals;
  previous: Totals | null;
  weekdays: Rank[];
  hours: Rank[];
  articles: Rank[];
  categories: Rank[];
  cities: Rank[];
  customers: Rank[];
  modes: Record<DeliveryMode, number>;
  methods: { especes: number; carte: number; virement: number; autre: number };
  /** Délai moyen, en jours, entre la commande et sa livraison (commandes livrées pendant la période). */
  leadTime: { days: number; count: number } | null;
  best: Bucket | null;
}

const inside = (day: string, p: { start: string; end: string }) => day >= p.start && day <= p.end;

function totalsOf(facts: Facts, p: { start: string; end: string }, firstOrder: Map<string, string>): Totals {
  const t: Totals = { revenue: 0, count: 0, average: 0, units: 0, discount: 0, collected: 0, profit: 0, costedHt: 0, articlesHt: 0, rest: 0, delivery: 0, offered: 0, cancelled: 0, newCustomers: 0, returningCustomers: 0 };
  const seen = new Set<string>();
  for (const s of facts.sales) {
    if (!inside(s.day, p)) continue;
    t.revenue += s.total;
    t.count += 1;
    t.units += s.units;
    t.discount += s.discount;
    t.profit += s.profit;
    t.costedHt += s.costedHt;
    t.articlesHt += s.articlesHt;
    t.rest += s.rest;
    t.delivery += s.delivery;
    if (s.offered) t.offered += 1;
    if (s.customer && !seen.has(s.customer)) {
      seen.add(s.customer);
      // Nouveau = sa toute première commande tombe dans la période.
      if (inside(firstOrder.get(s.customer) ?? s.day, p)) t.newCustomers += 1;
      else t.returningCustomers += 1;
    }
  }
  for (const pay of facts.payments) if (inside(pay.day, p)) t.collected += pay.amount;
  t.cancelled = facts.cancelled.filter((day) => inside(day, p)).length;
  for (const k of ["revenue", "discount", "collected", "profit", "costedHt", "articlesHt", "rest", "delivery"] as const) t[k] = round2(t[k]);
  t.average = t.count ? round2(t.revenue / t.count) : 0;
  return t;
}

function ranked(map: Map<string, Rank>, limit: number): Rank[] {
  return [...map.values()]
    .map((r) => ({ ...r, value: round2(r.value) }))
    .sort((a, b) => b.value - a.value || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function firstSaleDay(facts: Facts): string {
  return facts.sales.reduce((min, s) => (s.day < min ? s.day : min), facts.today);
}

export function analyse(facts: Facts, range: RangeId, wanted: Grain): Analysis {
  const period = periodOf(range, facts.today, firstSaleDay(facts));
  const grain = effectiveGrain(period, wanted);

  const firstOrder = new Map<string, string>();
  for (const s of facts.sales) if (s.customer && (firstOrder.get(s.customer) ?? "9999") > s.day) firstOrder.set(s.customer, s.day);

  const buckets = new Map<string, Bucket>();
  for (const key of bucketKeys(period.start, period.end, grain)) {
    buckets.set(key, { key, ...bucketLabels(key, grain, period.start, period.end), revenue: 0, count: 0, average: 0, units: 0, discount: 0, profit: 0, costedHt: 0, delivered: 0, especes: 0, carte: 0, virement: 0, autre: 0, collected: 0, cumulative: 0, previousCumulative: null });
  }
  const at = (day: string) => (inside(day, period) ? buckets.get(bucketKey(day, grain)) : undefined);

  const weekdays: Rank[] = WEEKDAYS.map((label) => ({ label, value: 0, count: 0 }));
  const hours: Rank[] = Array.from({ length: 24 }, (_, h) => ({ label: `${h} h`, value: 0, count: 0 }));
  const articles = new Map<string, Rank>(), categories = new Map<string, Rank>(), cities = new Map<string, Rank>(), customers = new Map<string, Rank>();
  const modes: Analysis["modes"] = { retrait: 0, porte: 0, etage: 0, montage: 0 };
  const methods = { especes: 0, carte: 0, virement: 0, autre: 0 };
  let leadDays = 0, leadCount = 0;
  const add = (map: Map<string, Rank>, key: string, label: string, value: number, count: number) => {
    const row = map.get(key) ?? { label, value: 0, count: 0 };
    row.value += value;
    row.count += count;
    map.set(key, row);
  };

  for (const s of facts.sales) {
    // Les livraisons comptent le jour où elles ont lieu, même si la commande date d'avant la période.
    const done = s.doneDay ? at(s.doneDay) : undefined;
    if (done && s.doneDay) {
      done.delivered += 1;
      leadDays += Math.max(0, daysBetween(s.day, s.doneDay));
      leadCount += 1;
    }
    const b = at(s.day);
    if (!b) continue;
    b.revenue += s.total;
    b.count += 1;
    b.units += s.units;
    b.discount += s.discount;
    b.profit += s.profit;
    b.costedHt += s.costedHt;
    weekdays[weekdayOf(s.day)].value += s.total;
    weekdays[weekdayOf(s.day)].count += 1;
    hours[s.hour].value += s.total;
    hours[s.hour].count += 1;
    modes[s.mode] += 1;
    add(cities, s.city, s.city, s.total, 1);
    if (s.customer) add(customers, s.customer, s.customerName || "Client sans nom", s.total, 1);
    for (const line of s.lines) {
      add(articles, line.key, line.label, line.revenue, line.quantity);
      add(categories, line.category, line.category, line.revenue, line.quantity);
    }
  }
  for (const pay of facts.payments) {
    const b = at(pay.day);
    if (!b) continue;
    const method = pay.method || "autre";
    b[method] += pay.amount;
    b.collected += pay.amount;
    methods[method] += pay.amount;
  }

  const list = [...buckets.values()];
  // Cumul de la période précédente, aligné jour pour jour sur la période affichée.
  let previousByBucket: Map<string, number> | null = null;
  if (period.previous) {
    previousByBucket = new Map();
    const shift = daysBetween(period.previous.start, period.start);
    for (const s of facts.sales) {
      if (!inside(s.day, period.previous)) continue;
      const moved = addDays(s.day, shift);
      const key = bucketKey(moved > period.end ? period.end : moved, grain);
      previousByBucket.set(key, (previousByBucket.get(key) ?? 0) + s.total);
    }
  }
  let cumulative = 0, previousCumulative = 0;
  for (const b of list) {
    cumulative += b.revenue;
    for (const k of ["revenue", "discount", "profit", "costedHt", "especes", "carte", "virement", "autre", "collected"] as const) b[k] = round2(b[k]);
    b.average = b.count ? round2(b.revenue / b.count) : 0;
    b.cumulative = round2(cumulative);
    if (previousByBucket) {
      previousCumulative += previousByBucket.get(b.key) ?? 0;
      b.previousCumulative = round2(previousCumulative);
    }
  }
  for (const k of ["especes", "carte", "virement", "autre"] as const) methods[k] = round2(methods[k]);
  for (const row of [...weekdays, ...hours]) row.value = round2(row.value);

  const withSales = list.filter((b) => b.revenue > 0);
  return {
    period,
    grain,
    buckets: list,
    totals: totalsOf(facts, period, firstOrder),
    previous: period.previous ? totalsOf(facts, period.previous, firstOrder) : null,
    weekdays,
    hours,
    articles: ranked(articles, 10),
    categories: ranked(categories, 10),
    cities: ranked(cities, 8),
    customers: ranked(customers, 8),
    modes,
    methods,
    leadTime: leadCount ? { days: Math.round((leadDays / leadCount) * 10) / 10, count: leadCount } : null,
    best: withSales.length ? withSales.reduce((a, b) => (b.revenue > a.revenue ? b : a)) : null,
  };
}

/** Ventes TTC entre deux jours inclus (pour les repères « aujourd'hui », « cette semaine », « ce mois »). */
export function revenueBetween(facts: Facts, start: string, end: string): { revenue: number; count: number; articlesHt: number } {
  let revenue = 0, count = 0, articlesHt = 0;
  for (const s of facts.sales) {
    if (s.day < start || s.day > end) continue;
    revenue += s.total;
    count += 1;
    articlesHt += s.articlesHt;
  }
  return { revenue: round2(revenue), count, articlesHt: round2(articlesHt) };
}

export const weekStart = mondayOf;
export { addMonths, daysBetween };
