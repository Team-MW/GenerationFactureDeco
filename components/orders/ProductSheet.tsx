"use client";

import { Loader2, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { updateArticle } from "@/app/commandes/actions";
import { eur } from "@/lib/format";
import { KIND_LABEL, STATUS_LABEL, chargeRate, costBreakdown, exVat, margin, recommend, transportPerUnit, type PricingSettings, type TransportTotals } from "@/lib/orders/pricing";
import type { StockRow } from "@/lib/orders/stock";
import { buttonPrimary, buttonSecondary } from "../ui";
import { useAction } from "./OrderActions";
import { inputClass } from "./bits";

const num = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0;
const text = (n: number) => (n > 0 ? String(n).replace(".", ",") : "");
const pct = (rate: number, digits = 1) => `${(rate * 100).toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`;
const coef = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Field({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] leading-snug text-slate-500">{hint}</span> : null}
    </label>
  );
}

function Line({ label, detail, value, share, strong = false, tone = "" }: { label: string; detail?: string; value: string; share?: string; strong?: boolean; tone?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? "border-t border-slate-200 font-semibold" : ""}`}>
      <span className="min-w-0 text-slate-700">
        {label}
        {detail ? <span className="ml-1.5 text-xs font-normal text-slate-400">{detail}</span> : null}
      </span>
      <span className="tabular flex shrink-0 items-baseline gap-2">
        {share ? <span className="text-xs font-normal text-slate-400">{share}</span> : null}
        <span className={tone || "text-slate-900"}>{value}</span>
      </span>
    </div>
  );
}

function Indicator({ label, value, hint, tone = "" }: { label: string; value: string; hint: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`tabular mt-0.5 text-lg font-semibold ${tone || "text-slate-900"}`}>{value}</div>
      <div className="text-[11px] leading-snug text-slate-500">{hint}</div>
    </div>
  );
}

/**
 * Fiche complète d'un produit : toutes ses informations sont modifiables à gauche, et l'analyse à droite
 * (décomposition du coût, marge, coefficients, prix plancher et conseillé) se recalcule pendant la saisie.
 */
export default function ProductSheet({ row, pricing, vatRate, averageRevenue, trucks, onClose }: { row: StockRow; pricing: PricingSettings; vatRate: number; averageRevenue: number; trucks: Map<string, TransportTotals>; onClose: () => void }) {
  const { pending, run } = useAction();
  const [form, setForm] = useState({
    name: row.name,
    reference: row.reference,
    category: row.category,
    dimensions: row.dimensions,
    color: row.color,
    supplier: row.supplier,
    price: text(row.price),
    cost: text(row.cost),
    // Rattaché à un transport, le produit n'a pas de camion saisi à la main (les montants affichés viennent du transport).
    truckCost: row.truckId ? "" : text(row.truckCost),
    truckUnits: row.truckId || row.truckUnits <= 0 ? "" : String(row.truckUnits),
    truckId: trucks.has(row.truckId) ? row.truckId : "",
    truckQty: row.truckQty > 0 ? String(row.truckQty) : "1",
    transport: text(row.transport),
    customsRate: text(row.customsRate),
    customsFixed: text(row.customsFixed),
    fees: text(row.fees),
  });
  // Postes de coût : champ vide = valeur par défaut du poste.
  const [extras, setExtras] = useState<Record<string, string>>(() => Object.fromEntries(pricing.costItems.map((item) => [item.id, row.extras[item.id] !== undefined ? String(row.extras[item.id]).replace(".", ",") : ""])));
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const draft = useMemo(() => {
    const own: Record<string, number> = {};
    for (const item of pricing.costItems) if ((extras[item.id] ?? "").trim() !== "") own[item.id] = num(extras[item.id]);
    const truckQty = Math.max(1, Math.floor(num(form.truckQty)));
    const truck = form.truckId ? trucks.get(form.truckId) : undefined;
    // Transport choisi : son coût, divisé par ses articles (en comptant ce produit avec la quantité saisie ici).
    const units = truck ? truck.units - (row.truckId === form.truckId ? Math.max(1, row.truckQty) : 0) + truckQty : 0;
    return {
      price: num(form.price),
      cost: num(form.cost),
      truckCost: truck ? truck.transport.cost : num(form.truckCost),
      truckUnits: truck ? units : Math.floor(num(form.truckUnits)),
      truckId: truck ? form.truckId : "",
      truckQty: truck ? truckQty : 0,
      transport: num(form.transport),
      customsRate: num(form.customsRate),
      customsFixed: num(form.customsFixed),
      fees: num(form.fees),
      extras: own,
    };
  }, [form, extras, pricing.costItems, trucks, row.truckId, row.truckQty]);
  const truck = draft.truckId ? trucks.get(draft.truckId) : undefined;

  const breakdown = costBreakdown(draft, pricing.costItems);
  const m = margin(draft, vatRate, pricing.costItems);
  const charges = chargeRate(pricing, averageRevenue, vatRate);
  const advice = recommend(draft, charges, pricing, vatRate);
  const viaTruck = draft.truckCost > 0 && draft.truckUnits > 0;
  const pieces = row.stock + row.reserved;
  const of = (amount: number) => (breakdown.total > 0 ? pct(amount / breakdown.total, 0) : undefined);
  // Nombre de pièces de ce produit à vendre dans le mois pour que leur marge couvre toutes les charges fixes.
  const breakEven = m && m.amount > 0 && charges.monthly > 0 ? Math.ceil(charges.monthly / m.amount) : null;

  const save = () =>
    run(async () => {
      // Rattaché à un transport : aucun camion « à la main » n'est enregistré, le transport fait foi.
      const result = await updateArticle(row.id, { name: form.name, reference: form.reference, category: form.category, dimensions: form.dimensions, color: form.color, supplier: form.supplier, ...draft, ...(truck ? { truckCost: 0, truckUnits: 0 } : {}) });
      if (result.ok) onClose();
      return result;
    }, "Fiche produit enregistrée");

  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/50 p-3 md:p-6" role="dialog" aria-modal="true" aria-label={`Fiche de ${row.name}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-6xl rounded-2xl bg-slate-50 shadow-2xl">
        <div className="flex items-start justify-between gap-4 rounded-t-2xl border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">{form.name || "Produit"}</h2>
            <p className="truncate text-xs text-slate-500">{[form.category, form.dimensions, form.color, form.supplier].filter(Boolean).join(" · ") || "Fiche produit"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer la fiche" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
          {/* ── Saisie ── */}
          <div className="flex flex-col gap-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Identité</h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Nom du produit" className="col-span-2">
                  <input className={inputClass} value={form.name} onChange={set("name")} required />
                </Field>
                <Field label="Catégorie">
                  <input className={inputClass} value={form.category} onChange={set("category")} />
                </Field>
                <Field label="Fournisseur">
                  <input className={inputClass} value={form.supplier} onChange={set("supplier")} />
                </Field>
                <Field label="Dimensions / configuration">
                  <input className={inputClass} value={form.dimensions} onChange={set("dimensions")} />
                </Field>
                <Field label="Coloris">
                  <input className={inputClass} value={form.color} onChange={set("color")} />
                </Field>
                <Field label="Référence" className="col-span-2">
                  <input className={inputClass} value={form.reference} onChange={set("reference")} />
                </Field>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Coût du produit (hors taxes)</h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Prix d'achat HT (€)" className="col-span-2">
                  <input className={inputClass} inputMode="decimal" aria-label="Fiche : prix d'achat" placeholder="Indispensable pour calculer" value={form.cost} onChange={set("cost")} />
                </Field>
                {pricing.transports.length > 0 ? (
                  <>
                    <Field label="Transport" hint={truck ? `${eur(truck.transport.cost)} pour ${draft.truckUnits} articles, soit ${eur(transportPerUnit(draft))} par pièce.` : "Camion ou conteneur qui a livré ce produit."}>
                      <select className={inputClass} aria-label="Fiche : transport" value={form.truckId} onChange={set("truckId")}>
                        <option value="">Aucun</option>
                        {pricing.transports.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.number}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Pièces de ce produit dans le transport">
                      <input className={inputClass} inputMode="numeric" aria-label="Fiche : pièces dans le transport" value={form.truckQty} onChange={set("truckQty")} disabled={!truck} />
                    </Field>
                  </>
                ) : null}
                <Field label="Coût total du camion (€)" hint={truck ? "Ignoré : le transport ci-dessus est utilisé." : "Sans transport numéroté : le camion ou conteneur entier."}>
                  <input className={inputClass} inputMode="decimal" aria-label="Fiche : coût du camion" value={form.truckCost} onChange={set("truckCost")} disabled={Boolean(truck)} />
                </Field>
                <Field label="Articles dans le camion" hint={truck ? "" : viaTruck ? `Soit ${eur(transportPerUnit(draft))} par pièce.` : "Le coût est divisé par ce nombre."}>
                  <input className={inputClass} inputMode="numeric" aria-label="Fiche : articles du camion" value={form.truckUnits} onChange={set("truckUnits")} disabled={Boolean(truck)} />
                </Field>
                <Field label="Transport par pièce (€)" hint={viaTruck ? "Ignoré : le camion ci-dessus est utilisé." : "À saisir si vous ne passez pas par un camion."}>
                  <input className={inputClass} inputMode="decimal" aria-label="Fiche : transport par pièce" value={form.transport} onChange={set("transport")} disabled={viaTruck} />
                </Field>
                <Field label="Autres frais par pièce (€)" hint="Manutention, emballage, assurance…">
                  <input className={inputClass} inputMode="decimal" aria-label="Fiche : autres frais" value={form.fees} onChange={set("fees")} />
                </Field>
                <Field label="Douane (€ par pièce)" hint="En plus, sans TVA.">
                  <input className={inputClass} inputMode="decimal" aria-label="Fiche : douane en euros" value={form.customsFixed} onChange={set("customsFixed")} />
                </Field>
                <Field label="Douane (%)" hint="Sur l'achat + le transport, sans TVA.">
                  <input className={inputClass} inputMode="decimal" aria-label="Fiche : douane" value={form.customsRate} onChange={set("customsRate")} />
                </Field>
              </div>
            </section>

            {pricing.costItems.length > 0 ? (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">Postes de coût du magasin</h3>
                <p className="mt-0.5 text-xs text-slate-500">Laissez vide pour garder la valeur par défaut du poste ; saisissez 0 pour ne pas l&apos;appliquer à ce produit.</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {pricing.costItems.map((item) => (
                    <Field key={item.id} label={`${item.label} (${KIND_LABEL[item.kind]})`}>
                      <input className={inputClass} inputMode="decimal" aria-label={`Fiche : ${item.label}`} placeholder={`Par défaut : ${String(item.value).replace(".", ",")}`} value={extras[item.id] ?? ""} onChange={(event) => setExtras((current) => ({ ...current, [item.id]: event.target.value }))} />
                    </Field>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Prix de vente</h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Prix de vente TTC (€)">
                  <input className={inputClass} inputMode="decimal" aria-label="Fiche : prix de vente" placeholder="À définir" value={form.price} onChange={set("price")} />
                </Field>
                <div className="flex items-end gap-2 pb-0.5">
                  {advice ? (
                    <>
                      <button type="button" onClick={() => setForm((current) => ({ ...current, price: text(advice.advisedTtc) }))} className={buttonSecondary} title="Reprendre le prix de vente conseillé">
                        Conseillé : {eur(advice.advisedTtc)}
                      </button>
                    </>
                  ) : (
                    <span className="pb-2 text-xs text-slate-500">Saisissez le prix d&apos;achat pour obtenir un prix conseillé.</span>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* ── Analyse ── */}
          <div className="flex flex-col gap-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <h3 className="text-sm font-semibold text-slate-900">Décomposition du coût de revient</h3>
              {breakdown.total > 0 ? (
                <div className="mt-2">
                  <Line label="Prix d'achat" value={eur(breakdown.purchase)} share={of(breakdown.purchase)} />
                  <Line label="Transport" detail={viaTruck ? `${truck ? `${truck.transport.number} : ` : ""}${eur(draft.truckCost)} ÷ ${draft.truckUnits} articles` : undefined} value={eur(breakdown.transport)} share={of(breakdown.transport)} />
                  <Line label="Autres frais" value={eur(breakdown.fees)} share={of(breakdown.fees)} />
                  {breakdown.extras.map((line) => (
                    <Line key={line.id} label={line.label} detail={`${line.kind === "pct-achat" ? `${line.value.toLocaleString("fr-FR")} % de l'achat` : "par pièce"}${line.own ? "" : " · par défaut"}`} value={eur(line.amount)} share={of(line.amount)} />
                  ))}
                  <Line label="Sous-total HT" value={eur(breakdown.subtotal)} strong />
                  <Line label="TVA" detail="20 % du sous-total, pas de la douane" value={eur(breakdown.vat)} />
                  <Line label="Douane" detail={[draft.customsRate > 0 ? `${draft.customsRate.toLocaleString("fr-FR")} %` : "", draft.customsFixed > 0 ? `${eur(draft.customsFixed)} par pièce` : ""].filter(Boolean).join(" + ") || "en plus, sans TVA"} value={eur(breakdown.customs)} />
                  <Line label="Coût total TTC" value={eur(breakdown.totalTtc)} strong />
                  <Line label="Coût de revient HT" detail="sous-total + douane · sert au calcul de la marge" value={eur(breakdown.total)} />
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Saisissez le prix d&apos;achat pour voir le détail du coût.</p>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <h3 className="text-sm font-semibold text-slate-900">Du prix de vente au bénéfice</h3>
              {m && advice?.current ? (
                <div className="mt-2">
                  <Line label="Prix de vente TTC" value={eur(draft.price)} />
                  <Line label="TVA reversée" detail={`${vatRate} %`} value={`− ${eur(m.vat)}`} />
                  <Line label="Prix de vente HT" value={eur(m.priceHt)} strong />
                  <Line label="Coût de revient" value={`− ${eur(m.cost)}`} share={pct(m.cost / m.priceHt, 0)} />
                  {breakdown.salesItems.map((line) => (
                    <Line key={line.id} label={line.label} detail={`${line.value.toLocaleString("fr-FR")} % du prix HT${line.own ? "" : " · par défaut"}`} value={`− ${eur((m.priceHt * line.value) / 100)}`} />
                  ))}
                  <Line label="Marge brute" value={eur(m.amount)} share={pct(m.rate)} strong tone={m.amount < 0 ? "text-rose-700" : "text-emerald-700"} />
                  <Line label="Part des charges du magasin" detail={charges.known ? pct(charges.rate) : "non réparties"} value={`− ${eur(advice.current.charges)}`} />
                  <Line label="Bénéfice net" value={eur(advice.current.net)} share={pct(advice.current.netRate)} strong tone={advice.current.net < 0 ? "text-rose-700" : "text-emerald-700"} />
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">{breakdown.total > 0 ? "Saisissez un prix de vente pour voir ce qu'il rapporte." : "Le prix d'achat et le prix de vente sont nécessaires."}</p>
              )}
            </section>

            <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Indicator label="Coefficient TTC" value={m ? coef(m.coefficient) : "—"} hint="prix de vente TTC ÷ coût de revient" />
              <Indicator label="Coefficient HT" value={m ? coef(m.coefficientHt) : "—"} hint="prix de vente HT ÷ coût de revient" />
              <Indicator label="Taux de marque" value={m ? pct(m.rate) : "—"} hint="marge ÷ prix de vente HT" tone={m && m.amount < 0 ? "text-rose-700" : ""} />
              <Indicator label="Taux de marge" value={m ? pct(m.markup) : "—"} hint="marge ÷ coût de revient" tone={m && m.amount < 0 ? "text-rose-700" : ""} />
              <Indicator label="Prix plancher" value={advice ? eur(advice.floorTtc) : "—"} hint={advice ? `${eur(advice.floorHt)} HT · ni gain ni perte` : "coût + charges, sans bénéfice"} />
              <Indicator label="Prix conseillé" value={advice ? eur(advice.advisedTtc) : "—"} hint={`pour ${pct(pricing.targetMargin / 100, 0)} de bénéfice net`} />
              <Indicator label="Situation" value={advice ? STATUS_LABEL[advice.status] : "Coût à renseigner"} hint={advice && draft.price > 0 ? `écart avec le conseillé : ${draft.price - advice.advisedTtc >= 0 ? "+" : ""}${eur(draft.price - advice.advisedTtc)}` : "selon le prix de vente saisi"} tone={advice ? (advice.status === "ok" ? "text-emerald-700" : advice.status === "sous-conseille" ? "text-amber-700" : advice.status === "sans-prix" ? "" : "text-rose-700") : ""} />
              <Indicator label="Stock" value={`${pieces} pièce${pieces > 1 ? "s" : ""}`} hint={breakdown.total > 0 ? `${eur(breakdown.total * pieces)} immobilisés${m ? ` · ${eur(m.amount * pieces)} de marge` : ""}` : `${row.stock} disponible${row.stock > 1 ? "s" : ""}, ${row.reserved} réservée${row.reserved > 1 ? "s" : ""}`} />
              <Indicator label="Seuil de rentabilité" value={breakEven ? `${breakEven} / mois` : "—"} hint={breakEven ? `pièces à vendre pour couvrir ${eur(charges.monthly)} de charges` : charges.monthly > 0 ? "marge insuffisante pour couvrir les charges" : "aucune charge saisie"} />
            </section>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-slate-200 bg-white px-5 py-3">
          <p className="text-xs text-slate-500">L&apos;analyse se met à jour pendant la saisie. Rien n&apos;est enregistré avant « Enregistrer ».{row.price > 0 ? ` Prix de vente enregistré : ${eur(row.price)} TTC (${eur(exVat(row.price, vatRate))} HT).` : ""}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={buttonSecondary}>
              Annuler
            </button>
            <button type="button" onClick={save} disabled={pending || !form.name.trim()} className={buttonPrimary}>
              {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer la fiche
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
