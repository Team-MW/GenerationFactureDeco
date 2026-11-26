import { ArrowDownRight, ArrowUpRight, BarChart3, Plus } from "lucide-react";
import Link from "next/link";
import Cockpit from "@/components/orders/Cockpit";
import { EmptyState } from "@/components/orders/bits";
import { Card, PageHeader, buttonPrimary } from "@/components/ui";
import { eur0, monthLabel } from "@/lib/format";
import { getPricing } from "@/lib/orders/charges";
import { addMonths, buildFacts, daysBetween, revenueBetween, weekStart } from "@/lib/orders/cockpit";
import { addDays, orderBalance, parisToday } from "@/lib/orders/logic";
import { chargeRate, landedCost, profitability, withTransports } from "@/lib/orders/pricing";
import { averageMonthlyRevenue } from "@/lib/orders/revenue";
import { getSettings } from "@/lib/settings";
import { loadDb } from "@/lib/orders/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cockpit des ventes" };

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
  const [{ orders, articles }, settings, pricing] = await Promise.all([loadDb(), getSettings(), getPricing()]);
  const vatRate = settings.vatRate;
  const today = parisToday();
  const facts = buildFacts(orders, articles, vatRate, today);

  if (facts.sales.length === 0) {
    return (
      <>
        <PageHeader title="Cockpit des ventes" />
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

  // Repères du moment : chaque période est comparée à la précédente, arrêtée au même point.
  const yesterday = addDays(today, -1);
  const monday = weekStart(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const day = revenueBetween(facts, today, today);
  const dayBefore = revenueBetween(facts, yesterday, yesterday);
  const week = revenueBetween(facts, monday, today);
  const weekBefore = revenueBetween(facts, addDays(monday, -7), addDays(today, -7));
  const month = revenueBetween(facts, monthStart, today);
  const monthBefore = revenueBetween(facts, addMonths(monthStart, -1), addMonths(today, -1));

  // Mois en cours face au seuil de rentabilité (charges fixes ÷ marge brute visée), hors taxes.
  const analysis = profitability(chargeRate(pricing, averageMonthlyRevenue(orders).average, vatRate), pricing.grossMarginTarget, vatRate);
  const monthHt = month.revenue / (1 + vatRate / 100);
  const elapsed = daysBetween(monthStart, today) + 1;
  const monthDays = daysBetween(monthStart, addMonths(monthStart, 1));
  const projection = (monthHt / elapsed) * monthDays;
  const breakEven = analysis && analysis.breakEvenHt > 0 ? analysis.breakEvenHt : 0;

  const active = orders.filter((o) => o.status === "active");
  const toDeliver = active.filter((o) => o.scheduledDate).length;
  const toSchedule = active.length - toDeliver;
  const open = orders.filter((o) => o.status !== "cancelled" && !orderBalance(o).settled);
  const rest = open.reduce((total, o) => total + orderBalance(o).rest, 0);

  const stock = withTransports(articles, pricing.transports);
  const pieces = stock.reduce((n, a) => n + Math.max(0, a.stock), 0);
  const stockValue = stock.reduce((n, a) => n + Math.max(0, a.stock) * a.price, 0);
  const stockCost = stock.reduce((n, a) => n + Math.max(0, a.stock) * landedCost(a, pricing.costItems), 0);
  const empty = stock.filter((a) => a.stock <= 0).length;

  return (
    <>
      <PageHeader title="Cockpit des ventes" subtitle={`${facts.sales.length} commande${facts.sales.length > 1 ? "s" : ""} hors annulations · montants TTC sauf mention contraire`} />

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">En ce moment</h2>
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Kpi label="Aujourd'hui" value={eur0(day.revenue)}>
          <div className="mb-1">{day.count} commande{day.count > 1 ? "s" : ""}</div>
          <Delta current={day.revenue} previous={dayBefore.revenue} versus="vs hier" />
        </Kpi>
        <Kpi label="Cette semaine" value={eur0(week.revenue)}>
          <div className="mb-1">{week.count} commande{week.count > 1 ? "s" : ""} depuis lundi</div>
          <Delta current={week.revenue} previous={weekBefore.revenue} versus="vs semaine dernière, au même jour" />
        </Kpi>
        <Kpi label={monthLabel(today.slice(0, 7))} value={eur0(month.revenue)}>
          <div className="mb-1">{month.count} commande{month.count > 1 ? "s" : ""} ce mois-ci</div>
          <Delta current={month.revenue} previous={monthBefore.revenue} versus="vs mois dernier, au même jour" />
        </Kpi>
        <Kpi label="Reste à encaisser" value={eur0(rest)}>
          {open.length} commande{open.length > 1 ? "s" : ""} non soldée{open.length > 1 ? "s" : ""}, toutes dates confondues
        </Kpi>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:mt-4 md:gap-4 xl:grid-cols-3">
        <Card className="px-5 py-4 xl:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Objectif du mois : couvrir les charges du magasin</h3>
            <Link href="/stock/charges" className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline">
              Charges du magasin
            </Link>
          </div>
          {breakEven > 0 ? (
            <>
              <p className="mt-1 text-xs text-slate-500">
                Il faut vendre {eur0(breakEven)} HT dans le mois pour payer les {eur0(analysis!.charges)} de charges fixes (avec {Math.round(analysis!.grossRate * 100)} % de marge brute).
              </p>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="whitespace-nowrap text-2xl font-semibold tracking-tight text-slate-900">{eur0(monthHt)} HT</span>
                <span className="text-sm text-slate-500">
                  vendus · {Math.round((monthHt / breakEven) * 100)} % du seuil · jour {elapsed} sur {monthDays}
                </span>
              </div>
              <div className="relative mt-2 h-2 rounded-full bg-blue-100" role="img" aria-label={`${Math.round((monthHt / breakEven) * 100)} % du seuil de rentabilité atteint`}>
                <div className="h-2 rounded-full bg-[#257de0]" style={{ width: `${Math.min(100, (monthHt / breakEven) * 100)}%` }} />
                {/* Repère : où il faudrait en être aujourd'hui pour atteindre le seuil en fin de mois. */}
                <div className="absolute -top-1 h-4 w-0.5 bg-slate-900" style={{ left: `${(elapsed / monthDays) * 100}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>Trait noir : là où il faudrait être aujourd&apos;hui ({eur0((breakEven * elapsed) / monthDays)} HT)</span>
                <span>
                  À ce rythme, fin de mois à <strong className="font-semibold text-slate-900">{eur0(projection)} HT</strong> :{" "}
                  {projection >= breakEven ? `seuil dépassé de ${eur0(projection - breakEven)}` : `il manquerait ${eur0(breakEven - projection)}`}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Renseignez les charges du magasin (loyer, salaires…) et la marge brute visée pour suivre ici le seuil de rentabilité du mois.</p>
          )}
        </Card>
        <Card className="grid grid-cols-2 divide-x divide-y divide-slate-100">
          {[
            ["Livraisons programmées", String(toDeliver), "à livrer ou à retirer"],
            ["À programmer", String(toSchedule), "commandes sans date"],
            ["Stock", `${pieces.toLocaleString("fr-FR")} pièces`, `${empty} produit${empty > 1 ? "s" : ""} à zéro`],
            ["Valeur du stock", eur0(stockValue), stockCost > 0 ? `au prix de vente · ${eur0(stockCost)} en coût de revient connu` : "au prix de vente TTC"],
          ].map(([label, value, hint]) => (
            <div key={label} className="px-4 py-3">
              <div className="text-xs text-slate-500">{label}</div>
              <div className="mt-0.5 text-base font-semibold text-slate-900">{value}</div>
              <div className="text-xs text-slate-400">{hint}</div>
            </div>
          ))}
        </Card>
      </div>

      <h2 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Statistiques par période</h2>
      <Cockpit facts={facts} marginKnown={facts.sales.some((s) => s.costedHt > 0)} />
    </>
  );
}
