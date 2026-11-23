import OrderForm from "@/components/orders/OrderForm";
import { PageHeader } from "@/components/ui";
import { loadDb } from "@/lib/orders/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouveau bon de commande" };

export default async function NewOrderPage() {
  const { articles } = await loadDb();
  return (
    <>
      <PageHeader title="Nouveau bon de commande" subtitle="Le stock est réservé dès la validation ; un article manquant passe en attente" />
      <OrderForm articles={[...articles].sort((a, b) => a.name.localeCompare(b.name, "fr"))} />
    </>
  );
}
