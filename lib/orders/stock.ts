import type { Article, Db } from "./types";

export interface StockRow extends Article {
  /** Quantité mise de côté pour des commandes en cours. */
  reserved: number;
  /** Quantité commandée par des clients mais pas encore en stock. */
  waiting: number;
}

/** Chaque article avec ce qui est réservé et ce qui est attendu par les commandes en cours. */
export function stockRows({ articles, orders }: Pick<Db, "articles" | "orders">): StockRow[] {
  const rows: StockRow[] = articles.map((article) => ({ ...article, reserved: 0, waiting: 0 }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const order of orders) {
    if (order.status !== "active") continue;
    for (const line of order.lines) {
      const row = byId.get(line.articleId);
      if (row) row[line.reserved ? "reserved" : "waiting"] += line.quantity;
    }
  }
  return rows;
}
