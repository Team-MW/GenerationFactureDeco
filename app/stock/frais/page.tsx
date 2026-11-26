import Link from "next/link";
import { BreakEvenChart, Legend, MonthlyResult, MonthlyVsBreakEven, type BreakEvenPoint, type MonthPoint } from "@/components/orders/FraisCharts";
import ProfitabilityCard, { ChargesBreakdown } from "@/components/orders/ProfitabilityCard";
import { RankList } from "@/components/orders/SalesCharts";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { eur, eur0, monthLabel, monthShort } from "@/lib/format";
import { getPricing } from "@/lib/orders/charges";
import { addMonths } from "@/lib/orders/cockpit";
import { orderTotals, parisDate, parisToday } from "@/lib/orders/logic";
import { CATEGORY_LABEL, chargeRate, chargesByCategory, costBreakdown, monthlyAmount, profitability, transportTotals, withTransports } from "@/lib/orders/pricing";
import { averageMonthlyRevenue } from "@/lib/orders/revenue";
import { loadDb } from "@/lib/orders/store";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cockpit des frais" };

const round2 = (n: number) => Math.round(n * 100) / 100;
const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)} %` : "–");

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="px-4 py-3.5 md:px-5 md:py-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:text-xs">{label}</div>
      <div className="mt-2 text-xl font-semibold leading-none tracking-tight text-slate-900 md:text-[26px]">{value}</div>
      <div className="mt-2.5 text-xs text-slate-500">{hint}</div>
    </Card>
  );
}

/** Cockpit des frais : tout ce que le magasin dépense (charges fixes, transports, coût des marchandises) et ce qu'il faut vendre pour le couvrir. */
export default async function Page() {
  const [db, settings, pricing] = await Promise.all([loadDb(), getSettings(), getPricing()]);
  const vatRate = settings.vatRate;
  const ht = 1 + vatRate / 100;
  const rate = chargeRate(pricing, averageMonthlyRevenue(db.orders).average, vatRate);
  const analysis = profitability(rate, pricing.grossMarginTarget, vatRate);
  const monthly = rate.monthly;
  const grossRate = Math.min(0.95, Math.max(0, pricing.grossMarginTarget) / 100);
  const breakEven = grossRate > 0 ? round2(monthly / grossRate) : 0;

  /* ----- Charges fixes ----- */
  const families = chargesByCategory(pricing.charges, pricing.employerRate);
  const salaries = families.find((f) => f.category === "salaire")?.monthly ?? 0;
  const topCharges = pricing.charges
    .map((c) => ({ label: c.label || "Charge sans nom", monthly: monthlyAmount(c, pricing.employerRate), category: c.category }))
    .filter((c) => c.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, 10)
    .map((c) => ({ label: c.label, value: c.monthly, detail: `${CATEGORY_LABEL[c.category]} · ${eur0(c.monthly)} / mois · ${percent(c.monthly, monthly)}` }));

  /* ----- Sur 100 € encaissés ----- */
  const vatPart = 100 - 100 / ht;
  const goodsPart = (100 / ht) * (1 - grossRate);
  const chargesPart = rate.known && rate.revenueHt > 0 ? (100 / ht) * (monthly / rate.revenueHt) : 0;
  const leftPart = 100 - vatPart - goodsPart - chargesPart;
  const split = [
    { label: "TVA reversée à l'État", value: vatPart, color: "#94a3b8", ink: "text-slate-900" },
    { label: "Achat des marchandises (coût de revient)", value: goodsPart, color: "#257de0", ink: "text-white" },
    { label: "Charges fixes du magasin", value: Math.min(chargesPart, 100 - vatPart - goodsPart), color: "#f47230", ink: "text-slate-900" },
    { label: "Bénéfice", value: Math.max(0, leftPart), color: "#00b894", ink: "text-slate-900" },
  ].filter((part) => part.value > 0.05);

  /* ----- Seuil de rentabilité : la courbe ----- */
  const maxRevenue = Math.max(breakEven * 1.6, rate.revenueHt * 1.25, 1000);
  const points: BreakEvenPoint[] = Array.from({ length: 41 }, (_, i) => {
    const revenue = Math.round((maxRevenue * i) / 40);
    return { revenue, margin: round2(revenue * grossRate), charges: monthly };
  });

  /* ----- Les douze derniers mois face au seuil ----- */
  const today = parisToday();
  const byMonth = new Map<string, { revenue: number; count: number }>();
  for (const order of db.orders) {
    if (order.status === "cancelled") continue;
    const key = parisDate(order.createdAt).slice(0, 7);
    const entry = byMonth.get(key) ?? { revenue: 0, count: 0 };
    entry.revenue += orderTotals(order).total;
    entry.count += 1;
    byMonth.set(key, entry);
  }
  // Avant la première commande enregistrée, le logiciel n'était pas utilisé : pas de résultat estimé pour ces mois-là.
  const firstMonth = [...byMonth.keys()].sort()[0] ?? "9999";
  const months: MonthPoint[] = Array.from({ length: 12 }, (_, i) => {
    const key = addMonths(`${today.slice(0, 7)}-01`, i - 11).slice(0, 7);
    const entry = byMonth.get(key) ?? { revenue: 0, count: 0 };
    const revenueHt = round2(entry.revenue / ht);
    return { short: monthShort(key), label: monthLabel(key), revenueHt, count: entry.count, result: key >= firstMonth ? round2(revenueHt * grossRate - monthly) : null };
  });
  const active = months.filter((m) => m.count > 0);
  const covered = active.filter((m) => (m.result ?? -1) >= 0).length;

  /* ----- Transports ----- */
  const trucks = [...transportTotals(db.articles, pricing.transports).values()];
  const truckCost = trucks.reduce((n, t) => n + Math.max(0, t.transport.cost), 0);
  const truckRows = trucks
    .sort((a, b) => b.transport.cost - a.transport.cost)
    .slice(0, 10)
    .map((t) => ({ label: t.transport.number || "Transport sans numéro", value: t.transport.cost, detail: t.units > 0 ? `${eur0(t.transport.cost)} · ${t.units} article${t.units > 1 ? "s" : ""} · ${eur(t.perUnit)} par article` : `${eur0(t.transport.cost)} · aucun article rattaché` }));

  /* ----- Ce que coûte le stock : par nature de frais, par fournisseur, par famille ----- */
  const parts = { purchase: 0, transport: 0, customs: 0, fees: 0, extras: 0, vat: 0 };
  const bySupplier = new Map<string, { value: number; count: number }>();
  const byCategory = new Map<string, { value: number; count: number }>();
  let costed = 0, pieces = 0, stockCost = 0;
  const stock = withTransports(db.articles, pricing.transports);
  for (const article of stock) {
    const b = costBreakdown(article, pricing.costItems);
    if (b.total <= 0) continue;
    costed += 1;
    // Les frais sont comptés sur les pièces en stock ; un produit à zéro compte pour une pièce, pour rester visible.
    const quantity = Math.max(1, article.stock);
    pieces += quantity;
    parts.purchase += b.purchase * quantity;
    parts.transport += b.transport * quantity;
    parts.customs += b.customs * quantity;
    parts.fees += b.fees * quantity;
    parts.extras += b.extrasTotal * quantity;
    parts.vat += b.vat * quantity;
    stockCost += b.total * quantity;
    for (const [map, key] of [[bySupplier, article.supplier || "Fournisseur non renseigné"], [byCategory, article.category || "Non classé"]] as const) {
      const entry = map.get(key) ?? { value: 0, count: 0 };
      entry.value += b.total * quantity;
      entry.count += quantity;
      map.set(key, entry);
    }
  }
  const natureRows = [
    ["Prix d'achat", parts.purchase],
    ["Transport", parts.transport],
    ["Douane", parts.customs],
    ["Autres frais", parts.fees],
    ["Postes de coût du magasin", parts.extras],
  ]
    .filter(([, value]) => (value as number) > 0)
    .map(([label, value]) => ({ label: label as string, value: value as number, detail: `${eur0(value as number)} · ${percent(value as number, stockCost)}` }));
  const group = (map: Map<string, { value: number; count: number }>) =>
    [...map.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 8)
      .map(([label, entry]) => ({ label, value: entry.value, detail: `${entry.count} pièce${entry.count > 1 ? "s" : ""} · ${eur0(entry.value)}` }));
  const missing = db.articles.length - costed;

  return (
    <>
      <PageHeader title="Cockpit des frais" subtitle="Tout ce que le magasin dépense, et ce qu'il faut vendre pour le payer · montants hors taxes sauf mention contraire">
        <Link href="/stock/charges" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Modifier les charges
        </Link>
      </PageHeader>

      {monthly <= 0 ? (
        <Card className="mb-4 px-5 py-4 text-sm text-slate-600">
          Aucune charge enregistrée pour l&apos;instant. Saisissez le loyer, les salaires et les autres frais dans{" "}
          <Link href="/stock/charges" className="font-medium text-slate-900 underline">
            Charges du magasin
          </Link>{" "}
          pour remplir ce cockpit.
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Tile label="Charges fixes par mois" value={eur0(monthly)} hint={`${pricing.charges.length} charge${pricing.charges.length > 1 ? "s" : ""} · ${eur0(monthly * 12)} par an`} />
        <Tile label="Charges par jour" value={eur0((monthly * 12) / 365)} hint="ce que le magasin coûte chaque jour, ouvert ou fermé" />
        <Tile label="Seuil de rentabilité" value={breakEven > 0 ? `${eur0(breakEven)} HT` : "–"} hint={breakEven > 0 ? `à vendre par mois, soit ${eur0(breakEven * ht)} TTC · ${eur0((breakEven * ht * 12) / 365)} TTC par jour` : "renseignez la marge brute visée"} />
        <Tile label="Poids des charges" value={rate.known && rate.revenueHt > 0 ? percent(monthly, rate.revenueHt) : "–"} hint={rate.known && rate.revenueHt > 0 ? `des ventes, pour ${eur0(rate.revenueHt)} HT vendus par mois` : "chiffre d'affaires de référence inconnu"} />
        <Tile label="Salaires" value={eur0(salaries)} hint={`${percent(salaries, monthly)} des charges${pricing.employerRate > 0 ? ` · cotisations patronales de ${pricing.employerRate} % comprises` : ""}`} />
        <Tile label="Transports reçus" value={eur0(truckCost)} hint={`${trucks.length} camion${trucks.length > 1 ? "s" : ""} ou conteneur${trucks.length > 1 ? "s" : ""} enregistré${trucks.length > 1 ? "s" : ""}`} />
        <Tile label="Coût du stock" value={eur0(stockCost)} hint={`coût de revient de ${pieces} pièce${pieces > 1 ? "s" : ""} · ${costed} produit${costed > 1 ? "s" : ""} chiffré${costed > 1 ? "s" : ""}`} />
        <Tile label="Produits sans prix d'achat" value={String(missing)} hint={missing > 0 ? `sur ${db.articles.length} : leurs frais ne sont pas comptés ici` : "tous les produits sont chiffrés"} />
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <ProfitabilityCard rate={rate} grossMarginTarget={pricing.grossMarginTarget} vatRate={vatRate} />
        <ChargesBreakdown charges={pricing.charges} employerRate={pricing.employerRate} />
      </div>

      {monthly > 0 && split.length > 0 ? (
        <Card className="mt-4 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Sur 100 € payés par un client, où va l&apos;argent ?</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Avec {pricing.grossMarginTarget} % de marge brute et {eur0(rate.revenueHt)} HT de ventes par mois
          </p>
          <div className="mt-3 flex h-7 gap-0.5" role="img" aria-label={split.map((part) => `${part.label} : ${part.value.toFixed(1)} €`).join(", ")}>
            {split.map((part) => (
              <div key={part.label} className={`flex items-center rounded px-2 text-xs font-semibold ${part.ink}`} style={{ width: `${part.value}%`, background: part.color }}>
                {part.value >= 7 ? `${part.value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} €` : ""}
              </div>
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 xl:grid-cols-4">
            {split.map((part) => (
              <li key={part.label} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-slate-700">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: part.color }} />
                  <span className="truncate">{part.label}</span>
                </span>
                <span className="tabular shrink-0 font-medium text-slate-900">{part.value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
              </li>
            ))}
          </ul>
          {leftPart < 0 ? (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
              Il ne reste rien : les charges demanderaient {chargesPart.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} € sur ces 100 €, il manque {Math.abs(leftPart).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €. Il faut vendre plus ou augmenter la marge.
            </p>
          ) : null}
        </Card>
      ) : null}

      {monthly > 0 && breakEven > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="À partir de combien de ventes le magasin gagne de l'argent" hint="La marge monte avec les ventes, les charges ne bougent pas : elles se croisent au seuil de rentabilité" />
            <Legend
              items={[
                { label: `Marge brute gagnée (${pricing.grossMarginTarget} % des ventes HT)`, color: "#257de0", line: true },
                { label: "Charges fixes du mois", color: "#f47230", line: true },
              ]}
            />
            <div className="px-3 pb-4 pt-3">
              <BreakEvenChart points={points} breakEven={breakEven} target={rate.revenueHt} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Ventes de chaque mois face au seuil" hint={active.length ? `Ventes HT réelles des 12 derniers mois · seuil atteint ${covered} mois sur ${active.length} avec des ventes` : "Ventes HT réelles des 12 derniers mois"} />
            <div className="px-3 pb-4 pt-3">
              <MonthlyVsBreakEven months={months} breakEven={breakEven} />
            </div>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title="Bénéfice ou perte estimé de chaque mois" hint={`Ventes HT réelles × ${pricing.grossMarginTarget} % de marge brute − ${eur0(monthly)} de charges fixes · à partir du premier mois avec une commande`} />
            <Legend
              items={[
                { label: "Mois gagnant", color: "#257de0" },
                { label: "Mois perdant", color: "#dc3c3d" },
              ]}
            />
            <div className="px-3 pb-2 pt-3">
              <MonthlyResult months={months} />
            </div>
            <div className="overflow-x-auto px-5 pb-4">
              <table className="tabular w-full min-w-[560px] text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-left uppercase tracking-wide text-slate-500">
                    <th className="py-2 font-medium">Mois</th>
                    <th className="py-2 text-right font-medium">Commandes</th>
                    <th className="py-2 text-right font-medium">Ventes HT</th>
                    <th className="py-2 text-right font-medium">Part du seuil</th>
                    <th className="py-2 text-right font-medium">Résultat estimé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...months].reverse().map((m) => (
                    <tr key={m.label}>
                      <td className="py-1.5 text-slate-900">{m.label}</td>
                      <td className="py-1.5 text-right text-slate-600">{m.count}</td>
                      <td className="py-1.5 text-right text-slate-600">{eur(m.revenueHt)}</td>
                      <td className="py-1.5 text-right text-slate-600">{percent(m.revenueHt, breakEven)}</td>
                      <td className="py-1.5 text-right font-medium text-slate-900">
                        {m.result === null ? "–" : `${m.result >= 0 ? "+" : "−"} ${eur(Math.abs(m.result))}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Les 10 charges les plus lourdes" hint="Ramenées au mois" />
          <RankList rows={topCharges} empty="Aucune charge enregistrée." />
        </Card>
        <Card>
          <CardHeader title="Charges par famille" hint="Loyers, salaires, énergie…" />
          <RankList rows={families.map((f) => ({ label: CATEGORY_LABEL[f.category], value: f.monthly, detail: `${f.count} ligne${f.count > 1 ? "s" : ""} · ${eur0(f.monthly)} · ${percent(f.monthly, monthly)}` }))} empty="Aucune charge enregistrée." />
        </Card>
        <Card>
          <CardHeader title="Transports les plus chers" hint="Coût du camion et part par article" />
          <RankList rows={truckRows} empty="Aucun camion ni conteneur enregistré dans « Transports »." />
        </Card>
        <Card>
          <CardHeader title="De quoi est fait le coût du stock" hint="Achat, transport, douane et frais des produits chiffrés" />
          <RankList rows={natureRows} empty="Aucun produit n'a encore de prix d'achat." />
          {parts.vat > 0 ? <p className="px-5 pb-4 text-xs text-slate-500">TVA payée à l&apos;achat sur ces produits : {eur0(parts.vat)} (hors douane, non comptée dans le coût de revient).</p> : null}
        </Card>
        <Card>
          <CardHeader title="Coût du stock par fournisseur" hint="Coût de revient des pièces en stock" />
          <RankList rows={group(bySupplier)} empty="Aucun produit n'a encore de prix d'achat." />
        </Card>
        <Card>
          <CardHeader title="Coût du stock par famille de produits" hint="Coût de revient des pièces en stock" />
          <RankList rows={group(byCategory)} empty="Aucun produit n'a encore de prix d'achat." />
        </Card>
      </div>
    </>
  );
}
