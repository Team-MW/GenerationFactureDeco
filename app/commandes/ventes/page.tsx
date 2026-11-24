import { ArrowDownRight, ArrowUpRight, BarChart3, Plus } from "lucide-react";
import Link from "next/link";
import { MonthlyChart, RankList, type SalesMonth } from "@/components/orders/SalesCharts";
import { EmptyState } from "@/components/orders/bits";
import { Card, CardHeader, PageHeader, buttonPrimary } from "@/components/ui";
import { eur, eur0, monthLabel, monthShort } from "@/lib/format";
import { DELIVERY_MODES, SHOPS, orderBalance, orderTotals } from "@/lib/orders/logic";
import { loadDb } from "@/lib/orders/store";
import type { DeliveryMode, ShopId } from "@/lib/orders/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tableau des ventes" };

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Mois (AAAA-MM) d'une date ISO, à l'heure de Paris. */
const parisMonth = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(iso)).slice(0, 7);

function Kpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <Card className="px-4 py-3.5 md:px-5 md:py-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:text-xs">{label}</div>
      <div className="tabular mt-2 text-xl font-semibold leading-none tracking-tight text-slate-900 md:text-[26px]">{value}</div>
      <div className="mt-3 min-h-5 text-xs text-slate-500">{children}</div>
    </Card>
  );
}

function Delta({ current, previous, versus }: { current: number; previous?: number; versus: string }) {
  if (!previous) return <span>{versus}</span>;
  const change = (current - previous) / previous;
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium ${up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
        <Icon size={12} />
        {up ? "+" : "−"}
        {Math.abs(change * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
      </span>
      {versus}
    </span>
  );
}

export default async function SalesPage() {
  const { orders } = await loadDb();
  // Les commandes annulées ne comptent pas dans les ventes.
  const sales = orders.filter((o) => o.status !== "cancelled");

  if (sales.length === 0) {
    return (
      <>
        <PageHeader title="Tableau des ventes" />
        <Card>
          <EmptyState icon={<BarChart3 size={26} strokeWidth={1.6} />} title="Pas encore de ventes" text="Les statistiques apparaîtront dès le premier bon de commande.">
            <Link href="/commandes/nouveau" className={buttonPrimary}>
              <Plus size={16} /> Nouveau bon de commande
            </Link>
          </EmptyState>
        </Card>
      </>
    );
  }

  const byMonth = new Map<string, SalesMonth>();
  const byArticle = new Map<string, { label: string; quantity: number; revenue: number }>();
  const byMode = new Map<DeliveryMode, number>();
  const byShop = new Map<ShopId, { count: number; revenue: number }>();
  let revenue = 0, paid = 0, discounts = 0, deliveryRevenue = 0, offered = 0;

  for (const order of sales) {
    const totals = orderTotals(order);
    const balance = orderBalance(order);
    revenue += totals.total;
    paid += balance.paid;
    discounts += totals.discount;
    deliveryRevenue += totals.delivery;
    if (order.delivery.offered) offered += 1;

    const key = parisMonth(order.createdAt);
    const month = byMonth.get(key) ?? { month: key, short: monthShort(key), label: monthLabel(key), revenue: 0, paid: 0, count: 0, average: 0 };
    month.revenue += totals.total;
    month.paid += balance.paid;
    month.count += 1;
    byMonth.set(key, month);

    for (const line of order.lines) {
      const article = byArticle.get(line.articleId) ?? { label: line.name, quantity: 0, revenue: 0 };
      article.quantity += line.quantity;
      article.revenue += line.unitPrice * line.quantity;
      byArticle.set(line.articleId, article);
    }
    byMode.set(order.delivery.mode, (byMode.get(order.delivery.mode) ?? 0) + 1);
    const shop = byShop.get(order.shop) ?? { count: 0, revenue: 0 };
    shop.count += 1;
    shop.revenue += totals.total;
    byShop.set(order.shop, shop);
  }

  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const m of months) {
    m.revenue = round2(m.revenue);
    m.paid = round2(m.paid);
    m.average = round2(m.revenue / m.count);
  }
  const last = months.at(-1)!;
  const previous = months.at(-2);
  const versus = previous ? `${last.short} vs ${previous.short}` : last.label;
  const rest = round2(revenue - paid);
  const unpaid = sales.filter((o) => !orderBalance(o).settled).length;

  const topArticles = [...byArticle.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((a) => ({ label: a.label, value: a.revenue, detail: `${a.quantity} vendu${a.quantity > 1 ? "s" : ""} · ${eur(a.revenue)}` }));
  const modes = (Object.keys(DELIVERY_MODES) as DeliveryMode[]).map((mode) => {
    const count = byMode.get(mode) ?? 0;
    return { label: DELIVERY_MODES[mode].label, value: count, detail: `${count} · ${Math.round((count / sales.length) * 100)} %` };
  });
  const shops = (Object.keys(SHOPS) as ShopId[]).filter((id) => id === "toulouse" || byShop.has(id)).map((id) => {
    const shop = byShop.get(id) ?? { count: 0, revenue: 0 };
    return { label: SHOPS[id].label, value: shop.revenue, detail: `${shop.count} commande${shop.count > 1 ? "s" : ""} · ${eur(shop.revenue)}` };
  });

  return (
    <>
      <PageHeader title="Tableau des ventes" subtitle={`${sales.length} commande${sales.length > 1 ? "s" : ""} hors annulations · montants TTC`} />

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Kpi label="Ventes" value={eur0(revenue)}>
          <Delta current={last.revenue} previous={previous?.revenue} versus={versus} />
        </Kpi>
        <Kpi label="Commandes" value={sales.length.toLocaleString("fr-FR")}>
          <Delta current={last.count} previous={previous?.count} versus={versus} />
        </Kpi>
        <Kpi label="Panier moyen" value={eur0(revenue / sales.length)}>
          <Delta current={last.average} previous={previous?.average} versus={versus} />
        </Kpi>
        <Kpi label="Reste à encaisser" value={eur0(rest)}>
          {unpaid} commande{unpaid > 1 ? "s" : ""} non soldée{unpaid > 1 ? "s" : ""} · {eur0(paid)} encaissés
        </Kpi>
      </div>

      <Card className="mt-3 grid grid-cols-2 divide-slate-100 md:mt-4 lg:grid-cols-4 lg:divide-x">
        {[
          ["Remises accordées", eur(round2(discounts)), "sur les articles"],
          ["Livraisons facturées", eur(round2(deliveryRevenue)), "inclus dans les ventes"],
          ["Livraisons offertes", String(offered), `sur ${sales.length} commande${sales.length > 1 ? "s" : ""}`],
          ["Meilleur mois", months.reduce((a, b) => (b.revenue > a.revenue ? b : a)).label, eur0(Math.max(...months.map((m) => m.revenue)))],
        ].map(([label, value, hint]) => (
          <div key={label} className="px-5 py-3.5">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="tabular mt-0.5 text-base font-semibold text-slate-900">{value}</div>
            <div className="text-xs text-slate-400">{hint}</div>
          </div>
        ))}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Ventes par mois" hint="Total TTC des commandes, selon leur date de création" />
          <div className="px-3 pb-4 pt-3">
            <MonthlyChart months={months} measure="revenue" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Articles les plus vendus" hint="Classés par chiffre d'affaires" />
          <RankList rows={topArticles} empty="Aucun article vendu." />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Commandes par mois" hint="Nombre de bons de commande" />
          <div className="px-3 pb-4 pt-3">
            <MonthlyChart months={months} measure="count" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Formules de livraison" hint="Répartition des commandes" />
          <RankList rows={modes} empty="" />
        </Card>
        <Card>
          <CardHeader title="Ventes par magasin" />
          <RankList rows={shops} empty="" />
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader title="Synthèse mensuelle" />
        <div className="mt-3 overflow-x-auto">
          <table className="tabular w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5 text-left font-medium">Mois</th>
                <th className="px-3 py-2.5 text-right font-medium">Commandes</th>
                <th className="px-3 py-2.5 text-right font-medium">Ventes</th>
                <th className="px-3 py-2.5 text-right font-medium">Panier moyen</th>
                <th className="px-3 py-2.5 text-right font-medium">Encaissé</th>
                <th className="px-5 py-2.5 text-right font-medium">Reste</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...months].reverse().map((m) => (
                <tr key={m.month}>
                  <td className="whitespace-nowrap px-5 py-2.5 font-medium text-slate-900">{m.label}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{m.count}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-900">{eur(m.revenue)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{eur(m.average)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{eur(m.paid)}</td>
                  <td className="px-5 py-2.5 text-right font-medium text-slate-900">{eur(round2(m.revenue - m.paid))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
