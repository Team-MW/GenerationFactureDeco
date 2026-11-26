"use client";

import { FileSpreadsheet, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { saveCharges } from "@/app/commandes/actions";
import { parseChargesFile } from "@/app/stock/actions";
import { toast } from "@/lib/client";
import { eur } from "@/lib/format";
import { CATEGORY_LABEL, PERIOD_LABEL, chargeRate, guessCategory, monthlyAmount, monthlyCharges, type Charge, type ChargeCategory, type ChargePeriod, type PricingSettings } from "@/lib/orders/pricing";
import { Card, CardHeader, buttonPrimary, buttonSecondary } from "../ui";
import { useAction } from "./OrderActions";
import ProfitabilityCard, { CATEGORY_COLOR, ChargesBreakdown } from "./ProfitabilityCard";
import { inputClass } from "./bits";

const num = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0;
const text = (n: number) => (n > 0 ? String(n).replace(".", ",") : "");
const pct = (rate: number, digits = 1) => `${(rate * 100).toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`;

interface Line {
  id: string;
  label: string;
  amount: string;
  period: ChargePeriod;
  category: ChargeCategory;
  note: string;
}

const SUGGESTIONS = ["Loyer", "Salaires et cotisations", "Électricité, eau, chauffage", "Assurances", "Expert-comptable", "Téléphone et internet", "Publicité", "Crédit ou leasing", "Carburant", "Frais bancaires"];
let counter = 0;
const newId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`;

function Row({ label, value, strong = false, tone = "" }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "mt-1 border-t border-slate-100 pt-2" : ""}`}>
      <dt className={strong ? "font-semibold text-slate-900" : "text-slate-500"}>{label}</dt>
      <dd className={`tabular shrink-0 ${strong ? "text-lg font-semibold" : "font-medium"} ${tone || "text-slate-900"}`}>{value}</dd>
    </div>
  );
}

/**
 * Charges fixes du magasin (loyers, salaires, énergie…), réglages du calcul des prix et analyse de rentabilité :
 * ce que le magasin doit vendre, et avec quelle marge, pour couvrir ses charges.
 */
export default function ChargesEditor({ pricing, vatRate, averageRevenue, revenueMonths }: { pricing: PricingSettings; vatRate: number; averageRevenue: number; revenueMonths: number }) {
  const { pending, run } = useAction();
  const [lines, setLines] = useState<Line[]>(() => pricing.charges.map((c) => ({ id: c.id, label: c.label, amount: text(c.amount), period: c.period, category: c.category, note: c.note })));
  const [revenue, setRevenue] = useState(text(pricing.monthlyRevenue));
  const [basis, setBasis] = useState(pricing.revenueBasis);
  const [employer, setEmployer] = useState(text(pricing.employerRate));
  const [gross, setGross] = useState(String(pricing.grossMarginTarget).replace(".", ","));
  const [target, setTarget] = useState(String(pricing.targetMargin).replace(".", ","));
  const [rounding, setRounding] = useState(pricing.rounding);
  const [reading, setReading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const touch =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setDirty(true);
    };

  const settings: PricingSettings = useMemo(
    () => ({
      costItems: pricing.costItems,
      transports: pricing.transports,
      charges: lines.filter((l) => l.label.trim()).map((l): Charge => ({ id: l.id, label: l.label.trim(), amount: num(l.amount), period: l.period, category: l.category, note: l.note.trim() })),
      monthlyRevenue: num(revenue),
      revenueBasis: basis,
      employerRate: num(employer),
      grossMarginTarget: num(gross),
      targetMargin: num(target),
      rounding,
    }),
    [lines, revenue, basis, employer, gross, target, rounding, pricing.costItems, pricing.transports],
  );
  const rate = chargeRate(settings, averageRevenue, vatRate);
  const monthly = monthlyCharges(settings.charges, settings.employerRate);
  const grossSalaries = settings.charges.filter((c) => c.category === "salaire").reduce((t, c) => t + monthlyAmount(c), 0);
  const update = (id: string, patch: Partial<Line>) => {
    setLines((list) => list.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const add = (label = "") => {
    setLines((list) => [...list, { id: newId(), label, amount: "", period: "mois", category: guessCategory(label), note: "" }]);
    setDirty(true);
  };
  const unused = SUGGESTIONS.filter((s) => !lines.some((l) => l.label.trim().toLowerCase() === s.toLowerCase()));

  const read = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    const form = new FormData();
    form.set("file", file);
    const result = await parseChargesFile(form);
    setReading(false);
    if (input.current) input.current.value = "";
    if (!result.ok) return toast(result.error, "error");
    // Une charge déjà saisie sous le même nom est mise à jour ; les autres sont ajoutées.
    setLines((list) => {
      const next = [...list];
      for (const charge of result.charges) {
        const existing = next.find((l) => l.label.trim().toLowerCase() === charge.label.toLowerCase());
        const values = { amount: text(charge.amount), period: charge.period, category: charge.category, note: charge.note };
        if (existing) Object.assign(existing, values);
        else next.push({ id: newId(), label: charge.label, ...values });
      }
      return next;
    });
    // Objectifs lus dans le fichier : repris s'ils y figurent (le chiffre d'affaires d'un tableau de bord est hors taxes).
    const found: string[] = [];
    if (result.targets.monthlyRevenue) {
      setRevenue(text(result.targets.monthlyRevenue));
      setBasis("ht");
      found.push(`objectif de ${eur(result.targets.monthlyRevenue)} HT par mois`);
    }
    if (result.targets.grossMargin) {
      setGross(String(result.targets.grossMargin).replace(".", ","));
      found.push(`marge brute cible de ${result.targets.grossMargin.toLocaleString("fr-FR")} %`);
    }
    setDirty(true);
    toast(`${result.charges.length} ligne${result.charges.length > 1 ? "s" : ""} lue${result.charges.length > 1 ? "s" : ""} dans « ${file.name} »${found.length ? `, ainsi que : ${found.join(", ")}` : ""}. Vérifiez puis enregistrez.`, "info");
  };

  const save = () =>
    run(async () => {
      const result = await saveCharges(settings);
      if (result.ok) setDirty(false);
      return result;
    }, "Charges et réglages enregistrés");

  const groups = (Object.keys(CATEGORY_LABEL) as ChargeCategory[]).map((category) => ({ category, lines: lines.filter((l) => l.category === category) })).filter((group) => group.lines.length > 0);

  return (
    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3">
      <div className="flex flex-col gap-4 2xl:col-span-2">
        {/* ── Analyse de rentabilité ── */}
        <ProfitabilityCard rate={rate} grossMarginTarget={settings.grossMarginTarget} vatRate={vatRate} />

        {/* ── Répartition ── */}
        <ChargesBreakdown charges={settings.charges} employerRate={settings.employerRate} />

        {/* ── Liste des charges ── */}
        <Card className="overflow-hidden">
          <CardHeader title="Charges fixes" hint="Tout ce que le magasin paie, qu'il vende ou non">
            <div className="flex shrink-0 gap-2">
              <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" aria-label="Fichier de charges" onChange={(e) => read(e.target.files?.[0])} />
              <button type="button" disabled={reading} onClick={() => input.current?.click()} className={buttonSecondary}>
                {reading ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} Importer un fichier
              </button>
            </div>
          </CardHeader>
          <div className="mt-3 border-t border-slate-100">
            {lines.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Aucune charge pour l&apos;instant. Ajoutez-les une par une ci-dessous, ou importez votre fichier Excel ou CSV.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Charge</th>
                      <th className="px-3 py-2 font-medium">Famille</th>
                      <th className="px-3 py-2 text-right font-medium">Montant (€ HT)</th>
                      <th className="px-3 py-2 font-medium">Périodicité</th>
                      <th className="px-3 py-2 text-right font-medium">Par mois</th>
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  {groups.map((group) => {
                    const subtotal = group.lines.reduce((t, l) => t + monthlyAmount({ amount: num(l.amount), period: l.period, category: l.category }, settings.employerRate), 0);
                    return (
                      <tbody key={group.category} className="divide-y divide-slate-100 border-t border-slate-200">
                        <tr className="bg-slate-50/70">
                          <td colSpan={4} className="px-3 py-1.5 text-xs font-semibold text-slate-700">
                            <span className={`mr-2 inline-block h-2 w-2 rounded-full ${CATEGORY_COLOR[group.category]}`} />
                            {CATEGORY_LABEL[group.category]}
                            {group.category === "salaire" && settings.employerRate > 0 ? <span className="ml-2 font-normal text-slate-500">cotisations patronales de {settings.employerRate.toLocaleString("fr-FR")} % comprises</span> : null}
                          </td>
                          <td className="tabular whitespace-nowrap px-3 py-1.5 text-right text-xs font-semibold text-slate-700">{eur(subtotal)}</td>
                          <td />
                        </tr>
                        {group.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="px-3 py-1.5">
                              <input className={inputClass} aria-label="Nom de la charge" placeholder="Ex. : Loyer" value={line.label} onChange={(e) => update(line.id, { label: e.target.value })} />
                              {line.note ? <div className="mt-0.5 truncate text-[11px] text-slate-500">{line.note}</div> : null}
                            </td>
                            <td className="px-3 py-1.5">
                              <select className={`${inputClass} w-40`} aria-label={`Famille de ${line.label || "la charge"}`} value={line.category} onChange={(e) => update(line.id, { category: e.target.value as ChargeCategory })}>
                                {(Object.keys(CATEGORY_LABEL) as ChargeCategory[]).map((c) => (
                                  <option key={c} value={c}>
                                    {CATEGORY_LABEL[c]}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-1.5">
                              <input className={`${inputClass} ml-auto w-32 text-right`} inputMode="decimal" aria-label={`Montant de ${line.label || "la charge"}`} placeholder="0" value={line.amount} onChange={(e) => update(line.id, { amount: e.target.value })} />
                            </td>
                            <td className="px-3 py-1.5">
                              <select className={`${inputClass} w-36`} aria-label={`Périodicité de ${line.label || "la charge"}`} value={line.period} onChange={(e) => update(line.id, { period: e.target.value as ChargePeriod })}>
                                {(Object.keys(PERIOD_LABEL) as ChargePeriod[]).map((p) => (
                                  <option key={p} value={p}>
                                    {PERIOD_LABEL[p]}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="tabular whitespace-nowrap px-3 py-1.5 text-right font-medium text-slate-900">{eur(monthlyAmount({ amount: num(line.amount), period: line.period, category: line.category }, settings.employerRate))}</td>
                            <td className="px-2 py-1.5">
                              <button
                                type="button"
                                aria-label={`Supprimer ${line.label || "la charge"}`}
                                onClick={() => {
                                  setLines((list) => list.filter((l) => l.id !== line.id));
                                  setDirty(true);
                                }}
                                className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    );
                  })}
                  <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                    <tr>
                      <td colSpan={4} className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                        Total des charges fixes
                      </td>
                      <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">{eur(monthly)} / mois</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-3 pb-2.5 text-right text-xs font-normal text-slate-500">
                        soit par an
                      </td>
                      <td className="tabular whitespace-nowrap px-3 pb-2.5 text-right font-normal text-slate-600">{eur(monthly * 12)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-3">
              <button type="button" onClick={() => add()} className={buttonSecondary}>
                <Plus size={16} /> Ajouter une charge
              </button>
              {unused.slice(0, 6).map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => add(suggestion)} className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-500 hover:text-slate-900">
                  + {suggestion}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ── Réglages ── */}
      <div className="flex flex-col gap-4">
        <Card className="p-4 md:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Réglages du calcul</h2>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Chiffre d&apos;affaires prévu par mois (€)</span>
            <div className="flex gap-2">
              <input className={inputClass} inputMode="decimal" aria-label="Chiffre d'affaires mensuel prévu" placeholder={averageRevenue > 0 ? `Vide = moyenne réelle : ${eur(averageRevenue)} TTC` : "Ex. : 125 000"} value={revenue} onChange={(e) => touch(setRevenue)(e.target.value)} />
              <select className={`${inputClass} w-24`} aria-label="Chiffre d'affaires saisi hors taxes ou TTC" value={basis} onChange={(e) => touch(setBasis)(e.target.value as "ht" | "ttc")}>
                <option value="ht">HT</option>
                <option value="ttc">TTC</option>
              </select>
            </div>
            <span className="mt-1 block text-xs text-slate-500">
              {averageRevenue > 0 ? `Ventes enregistrées ici : ${eur(averageRevenue)} TTC par mois en moyenne (${revenueMonths} mois). ` : ""}
              Les charges sont réparties sur ce chiffre : plus il est élevé, moins chaque vente en porte.
            </span>
          </label>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Cotisations patronales sur les salaires (%)</span>
            <input className={inputClass} inputMode="decimal" aria-label="Cotisations patronales" placeholder="0 = salaires déjà saisis en coût complet" value={employer} onChange={(e) => touch(setEmployer)(e.target.value)} />
            <span className="mt-1 block text-xs text-slate-500">
              {grossSalaries > 0 ? `Salaires saisis : ${eur(grossSalaries)} par mois. ` : ""}
              Si ce sont des salaires bruts, le magasin paie en plus ses cotisations (souvent 25 à 45 % du brut) : indiquez le taux pour les compter.
            </span>
          </label>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Marge brute visée (% du prix HT)</span>
            <input className={inputClass} inputMode="decimal" aria-label="Marge brute visée" value={gross} onChange={(e) => touch(setGross)(e.target.value)} />
            <span className="mt-1 block text-xs text-slate-500">Ce que laisse une vente une fois le produit payé, avant les charges. Sert à l&apos;analyse de rentabilité.</span>
          </label>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Bénéfice net visé sur chaque vente (% du prix HT)</span>
            <input className={inputClass} inputMode="decimal" aria-label="Bénéfice net visé" value={target} onChange={(e) => touch(setTarget)(e.target.value)} />
            <span className="mt-1 block text-xs text-slate-500">Ce qu&apos;il doit rester une fois le produit et les charges payés. Sert au prix de vente conseillé (PVC).</span>
          </label>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Arrondi des prix conseillés</span>
            <select className={inputClass} aria-label="Arrondi des prix conseillés" value={rounding} onChange={(e) => touch(setRounding)(Number(e.target.value))}>
              <option value={0}>Pas d&apos;arrondi</option>
              <option value={1}>À l&apos;euro supérieur</option>
              <option value={5}>Aux 5 € supérieurs</option>
              <option value={10}>À la dizaine supérieure</option>
              <option value={50}>Aux 50 € supérieurs</option>
            </select>
          </label>
          <button type="button" onClick={save} disabled={pending} className={`${buttonPrimary} mt-5 w-full justify-center`}>
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer{dirty ? " les modifications" : ""}
          </button>
          {dirty ? <p className="mt-2 text-center text-xs font-medium text-amber-700">Modifications non enregistrées</p> : null}
        </Card>

        <Card className="p-4 md:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Poids des charges dans chaque vente</h2>
          <dl className="mt-3 flex flex-col gap-1.5 text-sm">
            <Row label="Charges fixes" value={`${eur(rate.monthly)} / mois`} />
            <Row label="Chiffre d'affaires HT de référence" value={rate.revenueHt > 0 ? `${eur(rate.revenueHt)} / mois` : "—"} />
            <Row label="Taux de charges" value={rate.known ? pct(rate.rate) : "—"} strong tone={rate.rate >= 0.5 ? "text-rose-700" : ""} />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            {!rate.known
              ? "Indiquez un chiffre d'affaires mensuel prévu pour que les charges puissent être réparties sur les ventes."
              : rate.monthly === 0
                ? "Sans charges saisies, les prix conseillés ne tiennent compte que du coût des produits et de la marge visée."
                : `Dans le PVC, le prix plancher d'un produit vaut son coût de revient ÷ ${(1 - rate.rate).toLocaleString("fr-FR", { maximumFractionDigits: 3 })}, et le prix conseillé son coût de revient ÷ ${Math.max(0.05, 1 - rate.rate - settings.targetMargin / 100).toLocaleString("fr-FR", { maximumFractionDigits: 3 })}, avant TVA.`}
          </p>
        </Card>
      </div>
    </div>
  );
}
