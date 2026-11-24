import MailSettings from "@/components/MailSettings";
import SectionShell from "@/components/orders/SectionShell";
import SettingsForm from "@/components/SettingsForm";
import { PageHeader } from "@/components/ui";
import { getDataset } from "@/lib/data";
import { mailStatus } from "@/lib/mail";
import { READ_ONLY, getLogo, getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paramètres" };

/** Réglages communs à tout le logiciel : société, livraisons, factures, e-mails. */
export default async function SettingsPage() {
  const settings = await getSettings();
  const sample = (await getDataset()).invoices[0];
  return (
    <SectionShell companyName={settings.companyName} section="Paramètres" nav={[{ href: "/parametres", label: "Paramètres", short: "Paramètres", icon: "settings" }]}>
      <PageHeader title="Paramètres" subtitle="Votre société, les livraisons, les factures et l'envoi d'e-mails : ces réglages servent à tout le logiciel" />
      <SettingsForm initial={settings} hasLogo={(await getLogo()) !== null} sampleId={sample?.id ?? null} localDisk={!READ_ONLY} />
      <div className="mt-4 xl:max-w-[66%]">
        <MailSettings status={mailStatus()} />
      </div>
    </SectionShell>
  );
}
