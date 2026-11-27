import SavBoard, { type SavOrder } from "@/components/sav/SavBoard";
import { PageHeader } from "@/components/ui";
import { orderTotals, parisDate, parisToday } from "@/lib/orders/logic";
import { loadDb } from "@/lib/orders/store";
import { getSav } from "@/lib/sav/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "SAV" };

/** Service après-vente : on enregistre la demande du client, puis on fixe un rendez-vous chez lui. */
export default async function SavPage() {
  const [sav, db] = await Promise.all([getSav(), loadDb()]);
  // Les bons de commande servent à pré-remplir le client et le produit d'une nouvelle demande.
  const orders: SavOrder[] = db.orders
    .filter((order) => order.status !== "cancelled" || order.refund)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 500)
    .map((order) => ({
      number: order.number,
      customer: { name: order.customer.name, phone: order.customer.phone, email: order.customer.email, address: order.customer.address, postalCode: order.customer.postalCode, city: order.customer.city },
      products: order.lines.map((line) => line.name),
      paid: order.paid,
      total: orderTotals(order).total,
      closed: order.status === "cancelled",
      deliveredOn: order.status === "done" && order.doneAt ? parisDate(order.doneAt) : null,
    }));
  return (
    <>
      <PageHeader title="SAV" subtitle="Enregistrez la demande du client, puis fixez un rendez-vous chez lui" />
      <SavBoard tickets={sav.tickets} orders={orders} today={parisToday()} />
    </>
  );
}
