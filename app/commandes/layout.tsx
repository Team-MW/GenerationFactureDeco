import SectionShell, { type NavItem } from "@/components/orders/SectionShell";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const NAV: NavItem[] = [
  { href: "/commandes", label: "Commandes", short: "Commandes", icon: "orders", exact: true },
  { href: "/commandes/nouveau", label: "Nouveau bon", short: "Nouveau", icon: "plus" },
  { href: "/commandes/livraisons", label: "Espace livraison", short: "Livraisons", icon: "calendar" },
  { href: "/commandes/stock", label: "Stock", short: "Stock", icon: "stock" },
  { href: "/commandes/ventes", label: "Tableau des ventes", short: "Ventes", icon: "chart" },
];

export default async function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionShell companyName={(await getSettings()).companyName} section="Gestion commandes" nav={NAV}>
      {children}
    </SectionShell>
  );
}
