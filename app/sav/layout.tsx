import SectionShell from "@/components/orders/SectionShell";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Espace SAV : les demandes des clients et les rendez-vous chez eux. */
export default async function SavLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionShell companyName={(await getSettings()).companyName} section="SAV" nav={[{ href: "/sav", label: "Demandes de SAV", short: "SAV", icon: "wrench", exact: true }]}>
      {children}
    </SectionShell>
  );
}
