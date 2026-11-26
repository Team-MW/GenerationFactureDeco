"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { eur } from "@/lib/format";
import { CATEGORY_LABEL, chargesByCategory, monthlyCharges, profitability, type Charge, type ChargeCategory, type ChargeRate } from "@/lib/orders/pricing";
import { Card } from "../ui";

const pct = (rate: number, digits = 1) => `${(rate * 100).toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`;

/**
 * Le magasin gagne-t-il de l'argent ? Résultat mensuel au chiffre d'affaires de référence, seuil de rentabilité,
 * marge brute nécessaire et coefficient minimum. Affiché sur les pages Charges et Prix de vente (PVC).
 */
export default function ProfitabilityCard({ rate, grossMarginTarget, vatRate }: { rate: ChargeRate; grossMarginTarget: number; vatRate: number }) {
  const analysis = profitability(rate, grossMarginTarget, vatRate);
  if (!analysis || rate.monthly <= 0) return null;
  return (
          <Card className="overflow-hidden">
            <div className={`flex items-start gap-3 px-4 py-3 md:px-5 ${analysis.result >= 0 ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
              {analysis.result >= 0 ? <CheckCircle2 size={20} className="mt-0.5 shrink-0" /> : <AlertTriangle size={20} className="mt-0.5 shrink-0" />}
              <div>
                <h2 className="text-sm font-semibold">
                  {analysis.result >= 0
                    ? `À ${eur(analysis.revenueHt)} HT de ventes par mois et ${pct(analysis.grossRate)} de marge brute, le magasin dégage ${eur(analysis.result)} par mois.`
                    : `À ${eur(analysis.revenueHt)} HT de ventes par mois et ${pct(analysis.grossRate)} de marge brute, le magasin perd ${eur(-analysis.result)} par mois.`}
                </h2>
                <p className="mt-0.5 text-sm">
                  {analysis.result >= 0
                    ? `La marge brute (${eur(analysis.grossMargin)}) dépasse les charges (${eur(analysis.charges)}). Marge de sécurité : ${eur(analysis.safety)} de ventes au-dessus du seuil.`
                    : `La marge brute (${eur(analysis.grossMargin)}) ne couvre pas les charges (${eur(analysis.charges)}). Il faut soit vendre ${eur(analysis.breakEvenHt)} HT par mois, soit atteindre ${pct(analysis.requiredRate)} de marge brute.`}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-slate-100 border-t border-slate-100 lg:grid-cols-4 lg:divide-x">
              {[
                ["Seuil de rentabilité", `${eur(analysis.breakEvenHt)} HT / mois`, `soit ${eur(analysis.breakEvenHt * 12)} par an · charges ÷ marge brute`],
                ["Marge brute nécessaire", pct(analysis.requiredRate), `pour être à l'équilibre à ${eur(analysis.revenueHt)} HT`],
                ["Coefficient minimum", analysis.floorCoefficient.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), "prix TTC ÷ coût de revient, sans bénéfice"],
                ["Poids des charges", pct(rate.rate), `sur 100 € vendus HT, ${(rate.rate * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} € paient les charges`],
              ].map(([label, value, hint]) => (
                <div key={label} className="px-4 py-3 md:px-5">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
                  <div className="tabular mt-0.5 text-lg font-semibold text-slate-900">{value}</div>
                  <div className="text-xs text-slate-500">{hint}</div>
                </div>
              ))}
            </div>
          </Card>
        );
}

export const CATEGORY_COLOR: Record<ChargeCategory, string> = { loyer: "bg-sky-500", salaire: "bg-violet-500", energie: "bg-amber-500", vehicule: "bg-emerald-500", service: "bg-rose-500", autre: "bg-slate-400" };

/** Récapitulatif des charges par famille : une barre de répartition et le montant mensuel de chaque famille. */
export function ChargesBreakdown({ charges, employerRate, children }: { charges: Charge[]; employerRate: number; children?: React.ReactNode }) {
  const families = chargesByCategory(charges, employerRate);
  const monthly = monthlyCharges(charges, employerRate);
  if (families.length === 0 || monthly <= 0) return null;
  return (
          <Card className="p-4 md:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Répartition des charges <span className="tabular ml-1 font-normal text-slate-500">· {eur(monthly)} par mois · {eur(monthly * 12)} par an</span>
              </h2>
              {children}
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Répartition des charges par famille">
              {families.map((family) => (
                <div key={family.category} className={CATEGORY_COLOR[family.category]} style={{ width: `${(family.monthly / monthly) * 100}%` }} />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {families.map((family) => (
                <li key={family.category} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-slate-700">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${CATEGORY_COLOR[family.category]}`} />
                    <span className="truncate">
                      {CATEGORY_LABEL[family.category]} <span className="text-slate-400">({family.count})</span>
                    </span>
                  </span>
                  <span className="tabular shrink-0 font-medium text-slate-900">
                    {eur(family.monthly)} <span className="font-normal text-slate-500">· {pct(family.monthly / monthly, 0)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        );
}
