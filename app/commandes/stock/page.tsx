import StockTable from "@/components/orders/StockTable";
import { stockRows } from "@/lib/orders/stock";
import { PageHeader } from "@/components/ui";
import { loadDb } from "@/lib/orders/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventaire" };

export default async function StockPage() {
  const rows = stockRows(await loadDb());
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
