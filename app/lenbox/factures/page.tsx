import InvoiceTable from "@/components/InvoiceTable";
import { PageHeader } from "@/components/ui";
import { getDataset } from "@/lib/data";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const { mois } = await searchParams;
  const { invoices } = await getDataset();
  return (
    <>
      <PageHeader
        title="Factures"
        subtitle="Générées automatiquement à partir des fichiers importés · PDF enregistrés dans le dossier factures/"
      />
      <InvoiceTable invoices={invoices} initialMonth={mois ?? ""} defaultDesignation={(await getSettings()).designation} />
    </>
  );
}
