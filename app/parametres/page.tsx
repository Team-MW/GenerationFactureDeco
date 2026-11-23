import SettingsForm from "@/components/SettingsForm";
import { PageHeader } from "@/components/ui";
import { getDataset } from "@/lib/data";
import { getLogoPath, getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const sample = getDataset().invoices[0];
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Identité de votre société et contenu des factures" />
      <SettingsForm initial={getSettings()} hasLogo={getLogoPath() !== null} sampleId={sample?.id ?? null} />
    </>
  );
}
