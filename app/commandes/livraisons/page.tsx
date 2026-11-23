import AutoRefresh from "@/components/AutoRefresh";
import DeliveryCalendar from "@/components/orders/DeliveryCalendar";
import { PageHeader } from "@/components/ui";
import { parisToday } from "@/lib/orders/logic";
import { loadDb } from "@/lib/orders/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Espace livraison" };

export default async function DeliveriesPage() {
  const { orders } = await loadDb();
  return (
    <>
      <AutoRefresh />
      <PageHeader title="Espace livraison" subtitle="Calendrier des livraisons et retraits, rappels et commandes à programmer" />
      <DeliveryCalendar orders={orders} today={parisToday()} />
    </>
  );
}
