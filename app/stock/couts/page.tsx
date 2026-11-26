import CostTable from "@/components/orders/CostTable";
import { PageHeader } from "@/components/ui";
import { getPricing } from "@/lib/orders/charges";
import { averageMonthlyRevenue } from "@/lib/orders/revenue";
import { stockRows } from "@/lib/orders/stock";
import { loadDb } from "@/lib/orders/store";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coûts & marges" };

/** Coût de revient de chaque produit (achat, part du camion, douane, frais) et marge au prix de vente actuel. */
export default async function CostsPage() {
  const [db, settings, pricing] = await Promise.all([loadDb(), getSettings(), getPricing()]);
  return (
    <>
      <PageHeader title="Coûts & marges" subtitle="Coût de revient HT de chaque produit = achat + part du camion + douane + autres frais · cliquez sur un montant pour le modifier" />
      <CostTable rows={stockRows(db, pricing.transports)} vatRate={settings.vatRate} pricing={pricing} averageRevenue={averageMonthlyRevenue(db.orders).average} />
    </>
  );
}
