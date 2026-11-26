import StockGrid from "@/components/orders/StockGrid";
import { PageHeader } from "@/components/ui";
import { getPricing } from "@/lib/orders/charges";
import { stockRows } from "@/lib/orders/stock";
import { loadDb } from "@/lib/orders/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock" };

/** Le stock, vu depuis la gestion des commandes : même tableau que l'espace « Stock » de l'accueil. */
export default async function StockPage() {
  const [db, pricing] = await Promise.all([loadDb(), getPricing()]);
  const rows = stockRows(db, pricing.transports);
  return (
    <>
      <PageHeader title="Stock" subtitle="Produits et quantités · une entrée de stock sert d'abord les commandes en attente" />
      <StockGrid rows={rows} costItems={pricing.costItems} />
    </>
  );
}
