import ChargesEditor from "@/components/orders/ChargesEditor";
import { PageHeader } from "@/components/ui";
import { getPricing } from "@/lib/orders/charges";
import { averageMonthlyRevenue } from "@/lib/orders/revenue";
import { stockRows } from "@/lib/orders/stock";
import { loadDb } from "@/lib/orders/store";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Charges du magasin" };

/** Charges fixes du magasin et réglages du calcul des prix de vente. */
export default async function Page() {
  const [db, settings, pricing] = await Promise.all([loadDb(), getSettings(), getPricing()]);
  const revenue = averageMonthlyRevenue(db.orders);
  return (
    <>
      <PageHeader title="Charges du magasin" subtitle="Loyer, salaires, assurances… : ce que le magasin paie quoi qu'il vende, et que chaque vente doit aider à couvrir" />
      <ChargesEditor pricing={pricing} vatRate={settings.vatRate} averageRevenue={revenue.average} revenueMonths={revenue.months} />
    </>
  );
}
