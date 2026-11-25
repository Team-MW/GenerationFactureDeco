import StockTable, { type StockRow } from "@/components/orders/StockTable";
import { PageHeader } from "@/components/ui";
import { loadDb } from "@/lib/orders/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventaire" };

export default async function StockPage() {
  const { articles, orders } = await loadDb();
  const rows: StockRow[] = articles.map((article) => ({ ...article, reserved: 0, waiting: 0 }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const order of orders) {
    if (order.status !== "active") continue;
    for (const line of order.lines) {
      const row = byId.get(line.articleId);
      if (row) row[line.reserved ? "reserved" : "waiting"] += line.quantity;
    }
  }
  const toRestock = rows.filter((r) => r.waiting > 0).length;
  const inStock = rows.filter((r) => r.stock > 0).length;
  const noPrice = rows.filter((r) => r.price === 0).length;
  return (
    <>
      <PageHeader
        title="Inventaire"
        subtitle={`${rows.length} produit${rows.length > 1 ? "s" : ""} · ${inStock} en stock${noPrice ? ` · ${noPrice} sans prix` : ""}${toRestock ? ` · ${toRestock} à réapprovisionner` : ""} · une entrée de stock sert d'abord les commandes en attente`}
      />
      <StockTable rows={rows} />
    </>
  );
}
