import type { Settings } from "./types";

export const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const MONTHS_SHORT = [
  "Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin",
  "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc.",
];

const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const eur0Fmt = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const compactFmt = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const eur = (n: number) => eurFmt.format(n);
export const eur0 = (n: number) => eur0Fmt.format(n);
/** Format court pour les axes : « 45k€ » (sans espace, pour éviter les retours à la ligne). */
export const compactEur = (n: number) => `${compactFmt.format(n).replace(/\s/g, "")}€`;
export const pct = (n: number, digits = 2) =>
  `${(n * 100).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} %`;

/** « 2026-01 » → « Janvier 2026 » */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1] ?? "?"} ${y}`;
}

/** « 2026-01 » → « Janv. 26 » */
export function monthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1] ?? "?"} ${String(y).slice(2)}`;
}

/** « 2026-01-27 » → « 27/01/2026 » */
export function dateFr(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** « 2026-01-27 » → « 27 janvier 2026 » */
export function dateLong(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${(MONTHS[m - 1] ?? "").toLowerCase()} ${y}`;
}

/** « ELHASSANIA BENSIKADDOUR » → « Elhassania Bensikaddour » */
export function titleCase(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr")
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase("fr"));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Décompose un montant en HT / TVA / TTC selon les paramètres. */
export function computeTotals(amount: number, s: Pick<Settings, "vatRate" | "amountsIncludeVat">) {
  const rate = Math.max(0, s.vatRate) / 100;
  if (rate === 0) return { ht: round2(amount), vat: 0, ttc: round2(amount), rate };
  if (s.amountsIncludeVat) {
    const ht = round2(amount / (1 + rate));
    return { ht, vat: round2(amount - ht), ttc: round2(amount), rate };
  }
  const vat = round2(amount * rate);
  return { ht: round2(amount), vat, ttc: round2(amount + vat), rate };
}
