import TransportsBoard from "@/components/orders/TransportsBoard";
import { PageHeader } from "@/components/ui";
import { getPricing } from "@/lib/orders/charges";
import { stockRows } from "@/lib/orders/stock";
import { loadDb } from "@/lib/orders/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transports" };

/** Camions et conteneurs reçus : pour chacun, son coût, les articles qu'il a livrés et la part de transport de chaque pièce. */
export default async function TransportsPage() {
  const [db, pricing] = await Promise.all([loadDb(), getPricing()]);
  return (
    <>
      <PageHeader title="Transports" subtitle="Chaque camion ou conteneur, les articles qu'il a livrés et la part de transport qui revient à chacun" />
      <TransportsBoard rows={stockRows(db, pricing.transports)} pricing={pricing} />
    </>
  );
}
