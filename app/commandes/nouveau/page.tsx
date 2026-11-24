import OrderForm, { type AgendaItem } from "@/components/orders/OrderForm";
import { PageHeader } from "@/components/ui";
import { parisToday } from "@/lib/orders/logic";
import { MAIL_CONFIGURED } from "@/lib/mail";
import { currentScope, loadDb } from "@/lib/orders/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouveau bon de commande" };

export default async function NewOrderPage() {
  const { articles, orders } = await loadDb();
  const today = parisToday();
  const testMode = (await currentScope()) === "test";
  // Planning à venir, pour voir la charge d'une journée au moment de programmer.
  const agenda: AgendaItem[] = orders
    .filter((o) => o.status === "active" && o.scheduledDate && o.scheduledDate >= today)
    .map((o) => ({ date: o.scheduledDate!, slot: o.slot, time: o.time, name: o.customer.name, mode: o.delivery.mode, city: o.customer.city }));
  return (
    <>
      <PageHeader title="Nouveau bon de commande" subtitle="Le stock est réservé dès la validation ; la livraison peut être programmée tout de suite" />
      <OrderForm articles={[...articles].sort((a, b) => a.name.localeCompare(b.name, "fr"))} agenda={agenda} today={today} mailReady={MAIL_CONFIGURED && !testMode} testMode={testMode} />
    </>
  );
}
