import PvcTable from "@/components/orders/PvcTable";
import { PageHeader } from "@/components/ui";
import { getPricing } from "@/lib/orders/charges";
import { averageMonthlyRevenue } from "@/lib/orders/revenue";
import { stockRows } from "@/lib/orders/stock";
import { loadDb } from "@/lib/orders/store";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prix de vente (PVC)" };

/** Prix plancher et prix de vente conseillé de chaque produit. */
export default async function Page() {
  const [db, settings, pricing] = await Promise.all([loadDb(), getSettings(), getPricing()]);
  const revenue = averageMonthlyRevenue(db.orders);
  return (
    <>
      <PageHeader title="Prix de vente (PVC)" subtitle="Prix plancher et prix de vente conseillé de chaque produit, calculés avec son coût de revient et les charges du magasin" />
      <PvcTable rows={stockRows(db, pricing.transports)} pricing={pricing} vatRate={settings.vatRate} averageRevenue={revenue.average} revenueMonths={revenue.months} />
    </>
  );
}
