import { ArrowUpRight, Boxes, CreditCard, Package, PackageCheck, Truck, Wrench } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";
import { CLERK_ON } from "@/lib/clerk";
import { accessPassword } from "@/lib/access";
import { getSettings } from "@/lib/settings";
import { TestModeSwitch } from "@/components/TestMode";
import { currentScope } from "@/lib/orders/store";
import { logout } from "./connexion/actions";

export const dynamic = "force-dynamic";

const SPACES = [
  {
    href: "/commandes",
    title: "Gestion commandes",
    description: "Bons de commande, planning des livraisons, stock et tableau des ventes.",
    icon: Package,
  },
  {
    href: "/stock",
    title: "Stock dashboard",
    description: "Stock, coûts et marges, transports, prix de vente et charges du magasin : tous les tableaux au même endroit.",
    icon: Boxes,
  },
  {
    href: "/magasinier",
    title: "Magasinier",
    description: "Commandes à préparer pour les prochaines livraisons et retraits.",
    icon: PackageCheck,
  },
  {
    href: "/livreur",
    title: "Livreur",
    description: "Tournée du jour, itinéraire sur la carte et confirmation des livraisons.",
    icon: Truck,
  },
  {
    href: "/sav",
    title: "SAV",
    description: "Service après-vente : demandes des clients et rendez-vous chez eux.",
    icon: Wrench,
  },
  {
    href: "/lenbox",
    title: "Gestion Lenbox",
    description: "Factures générées depuis les exports Lenbox, statistiques et tableau de bord.",
    icon: CreditCard,
  },
];

export default async function HomePage() {
  const { companyName } = await getSettings();
  const testMode = (await currentScope()) === "test";
  return (
    <main className="flex min-h-full flex-col bg-black px-5 py-10 text-white sm:px-10">
      <header className="mx-auto w-full max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <div className="text-lg font-semibold tracking-tight">{companyName}</div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <TestModeSwitch active={testMode} />
            <Link href="/parametres" className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-400 transition hover:bg-white/10 hover:text-white">
              Paramètres
            </Link>
          {CLERK_ON ? (
            <span className="ml-1 inline-flex items-center">
              <Suspense>
                <UserButton />
              </Suspense>
            </span>
          ) : accessPassword() ? (
            <form action={logout}>
              <button type="submit" className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-400 transition hover:bg-white/10 hover:text-white">
                Se déconnecter
              </button>
            </form>
          ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Espace de gestion</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Que souhaitez-vous gérer ?</h1>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SPACES.map(({ href, title, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-h-40 flex-col justify-between gap-6 rounded-2xl border border-white/10 bg-neutral-950 p-6 transition duration-200 hover:border-white hover:bg-white hover:text-black active:scale-[0.99] sm:min-h-52 sm:p-7"
            >
              <div className="flex items-start justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 transition group-hover:bg-black group-hover:text-white">
                  <Icon size={22} strokeWidth={1.7} />
                </span>
                <ArrowUpRight
                  size={22}
                  className="text-neutral-600 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black"
                />
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-neutral-400 transition group-hover:text-neutral-600">
                  {description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
