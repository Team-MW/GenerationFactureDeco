import AutoRefresh from "@/components/AutoRefresh";
import SectionShell from "@/components/orders/SectionShell";
import StockGrid from "@/components/orders/StockGrid";
import { PageHeader } from "@/components/ui";
import { stockRows } from "@/lib/orders/stock";
import { loadDb } from "@/lib/orders/store";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock" };

/** Tout le stock dans un seul grand tableau : recherche, filtres, ajout de produits, entrées et sorties. */
export default async function StockPage() {
  const rows = stockRows(await loadDb());
  return (
    <SectionShell companyName={(await getSettings()).companyName} section="Stock" nav={[{ href: "/stock", label: "Tout le stock", short: "Stock", icon: "stock" }]}>
      <AutoRefresh />
      <PageHeader title="Stock" subtitle="Produits et quantités · une entrée de stock sert d'abord les commandes en attente" />
      <StockGrid rows={rows} />
    </SectionShell>
  );
}
