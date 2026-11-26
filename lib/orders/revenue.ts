import { orderTotals, parisDate, parisToday } from "./logic";
import type { Order } from "./types";

/**
 * Chiffre d'affaires TTC mensuel moyen, calculé sur les six derniers mois complets où il y a eu des ventes
 * (commandes annulées exclues ; le mois en cours n'est compté que s'il est le seul). Sert de base pour répartir les charges fixes tant qu'aucun objectif n'est saisi.
 */
export function averageMonthlyRevenue(orders: Order[]): { average: number; months: number } {
  const byMonth = new Map<string, number>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const month = parisDate(order.createdAt).slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + orderTotals(order).total);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  // Le mois en cours n'est pas terminé : dès qu'un mois complet existe, on ne le compte pas.
  const complete = months.length > 1 && months[0][0] === parisToday().slice(0, 7) ? months.slice(1) : months;
  const recent = complete.slice(0, 6);
  if (recent.length === 0) return { average: 0, months: 0 };
  return { average: Math.round((recent.reduce((total, [, value]) => total + value, 0) / recent.length) * 100) / 100, months: recent.length };
}
