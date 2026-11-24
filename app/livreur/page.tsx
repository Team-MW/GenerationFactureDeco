import AutoRefresh from "@/components/AutoRefresh";
import DriverBoard from "@/components/orders/DriverBoard";
import SectionShell from "@/components/orders/SectionShell";
import { isPickup, parisToday } from "@/lib/orders/logic";
import { loadDb } from "@/lib/orders/store";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Livreur" };

export default async function DriverPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const today = parisToday();
  const requested = (await searchParams).date;
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
  const { orders, depot } = await loadDb();
  const settings = await getSettings();
  const deliveries = orders.filter((o) => o.scheduledDate === date && !isPickup(o) && o.status !== "cancelled");
  return (
    <SectionShell companyName={settings.companyName} section="Livreur" nav={[{ href: "/livreur", label: "Tournée du jour", short: "Tournée", icon: "truck" }]}>
      <AutoRefresh />
      <DriverBoard companyName={settings.companyName} date={date} today={today} orders={deliveries} depot={depot} depotAddress={settings.depotAddress.trim() || DEFAULT_SETTINGS.depotAddress} />
    </SectionShell>
  );
}
