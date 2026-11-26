import SectionShell from "@/components/orders/SectionShell";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Espace Stock : les quantités, le coût de chaque produit, les charges du magasin et les prix de vente à pratiquer. */
export default async function StockLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionShell
      companyName={(await getSettings()).companyName}
      section="Stock dashboard"
      wide
      nav={[
        { href: "/stock", label: "Stock", short: "Stock", icon: "stock", exact: true },
        { href: "/stock/couts", label: "Coûts & marges", short: "Coûts", icon: "calculator" },
        { href: "/stock/transports", label: "Transports", short: "Camions", icon: "truck" },
        { href: "/stock/pvc", label: "Prix de vente (PVC)", short: "PVC", icon: "tags" },
        { href: "/stock/charges", label: "Charges du magasin", short: "Charges", icon: "charges" },
        { href: "/stock/frais", label: "Cockpit des frais", short: "Frais", icon: "chart" },
      ]}
    >
      {children}
    </SectionShell>
  );
}
