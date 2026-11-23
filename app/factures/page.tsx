import InvoiceTable from "@/components/InvoiceTable";
import { PageHeader } from "@/components/ui";
import { getDataset } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const { mois } = await searchParams;
  const { invoices } = getDataset();
  return (
    <>
      <PageHeader
        title="Factures"
        subtitle="Générées automatiquement à partir des fichiers importés · PDF enregistrés dans le dossier factures/"
      />
      <InvoiceTable invoices={invoices} initialMonth={mois ?? ""} />
    </>
  );
}
