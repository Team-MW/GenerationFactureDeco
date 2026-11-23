import SettingsForm from "@/components/SettingsForm";
import { PageHeader } from "@/components/ui";
import { getDataset } from "@/lib/data";
import { getLogo, getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sample = (await getDataset()).invoices[0];
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Identité de votre société et contenu des factures" />
      <SettingsForm initial={await getSettings()} hasLogo={(await getLogo()) !== null} sampleId={sample?.id ?? null} />
    </>
  );
}
