import SectionShell from "@/components/orders/SectionShell";
import WarehouseBoard from "@/components/orders/WarehouseBoard";
import { PageHeader } from "@/components/ui";
import { isPickup, isStockComplete, parisToday } from "@/lib/orders/logic";
import { loadDb } from "@/lib/orders/store";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Magasinier" };

export default async function WarehousePage() {
  const { orders } = await loadDb();
  const active = orders.filter((o) => o.status === "active");
  // À préparer : tout ce qui a une date ; les retraits sans date dès que le stock est complet.
  const upcoming = active.filter((o) => o.scheduledDate).sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!) || a.slot.localeCompare(b.slot));
  const undated = active.filter((o) => !o.scheduledDate && isPickup(o) && isStockComplete(o));
  const history = orders
    .filter((o) => o.preparedAt && (o.status !== "active" || o.prepared))
    .sort((a, b) => b.preparedAt!.localeCompare(a.preparedAt!))
    .slice(0, 200);
  return (
    <SectionShell companyName={(await getSettings()).companyName} section="Magasinier" nav={[{ href: "/magasinier", label: "Préparation", short: "Préparation", icon: "warehouse" }]}>
      <PageHeader title="Préparation des commandes" subtitle="Cartons à préparer pour les prochaines livraisons et les retraits sur place" />
      <WarehouseBoard upcoming={upcoming} undated={undated} history={history} today={parisToday()} />
    </SectionShell>
  );
}
