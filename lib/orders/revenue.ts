import { orderTotals, parisDate } from "./logic";
import type { Order } from "./types";

/**
 * Chiffre d'affaires TTC mensuel moyen, calculé sur les six derniers mois où il y a eu des ventes
 * (commandes annulées exclues). Sert de base pour répartir les charges fixes tant qu'aucun objectif n'est saisi.
 */
export function averageMonthlyRevenue(orders: Order[]): { average: number; months: number } {
  const byMonth = new Map<string, number>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const month = parisDate(order.createdAt).slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + orderTotals(order).total);
  }
  const recent = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  if (recent.length === 0) return { average: 0, months: 0 };
  return { average: Math.round((recent.reduce((total, [, value]) => total + value, 0) / recent.length) * 100) / 100, months: recent.length };
}
