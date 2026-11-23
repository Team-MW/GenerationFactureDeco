import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import OrderList from "@/components/orders/OrderList";
import { EmptyState } from "@/components/orders/bits";
import { Card, PageHeader, buttonPrimary } from "@/components/ui";
import { isStockComplete } from "@/lib/orders/logic";
import { loadDb } from "@/lib/orders/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gestion commandes" };

export default async function OrdersPage() {
  const { orders } = await loadDb();
  const active = orders.filter((o) => o.status === "active");
  const waiting = active.filter((o) => !isStockComplete(o)).length;
  return (
    <>
      <PageHeader
        title="Commandes"
        subtitle={orders.length ? `${active.length} en cours · ${active.length - waiting} en stock · ${waiting} en attente de stock` : "Bons de commande et suivi du stock"}
      >
        <Link href="/commandes/nouveau" className={buttonPrimary}>
          <Plus size={16} /> Nouveau bon de commande
        </Link>
      </PageHeader>
      {orders.length === 0 ? (
        <Card>
          <EmptyState icon={<ClipboardList size={26} strokeWidth={1.6} />} title="Aucune commande" text="Créez votre premier bon de commande : les articles et le stock se mettent à jour automatiquement.">
            <Link href="/commandes/nouveau" className={buttonPrimary}>
              <Plus size={16} /> Nouveau bon de commande
            </Link>
          </EmptyState>
        </Card>
      ) : (
        <OrderList orders={orders} />
      )}
    </>
  );
}
