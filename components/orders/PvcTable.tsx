"use client";

import { ArrowDown, ArrowUp, Check, ChevronsUpDown, Loader2, RotateCcw, Search, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { applyPrices, setArticlePrice } from "@/app/commandes/actions";
import { eur } from "@/lib/format";
import { STATUS_LABEL, chargeRate, recommend, transportTotals, type PriceStatus, type PricingSettings } from "@/lib/orders/pricing";
import type { StockRow } from "@/lib/orders/stock";
import { Card, buttonPrimary, buttonSecondary } from "../ui";
import { confirmDialog } from "../ConfirmDialog";
import { useAction } from "./OrderActions";
import ProductSheet from "./ProductSheet";
import ProfitabilityCard, { ChargesBreakdown } from "./ProfitabilityCard";
import { QuickEdit } from "./StockGrid";
import { inputClass } from "./bits";

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0;
const pct = (rate: number) => `${(rate * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
const dash = <span className="text-slate-300">—</span>;

const STATUS_STYLE: Record<PriceStatus, string> = {
  "sans-cout": "bg-slate-100 text-slate-600",
  "sans-prix": "bg-violet-50 text-violet-700",
  perte: "bg-rose-100 text-rose-800",
  "sous-plancher": "bg-rose-50 text-rose-700",
  "sous-conseille": "bg-amber-50 text-amber-800",
  ok: "bg-emerald-50 text-emerald-700",
};
const STATUS_ORDER: PriceStatus[] = ["perte", "sous-plancher", "sous-conseille", "sans-prix", "ok", "sans-cout"];

type SortKey = "name" | "cost" | "floor" | "advised" | "price" | "gap" | "net";

function Tile({ label, value, hint, tone = "" }: { label: string; value: string; hint?: React.ReactNode; tone?: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`tabular mt-1 text-xl font-semibold ${tone || "text-slate-900"}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
    </Card>
  );
}

/**
 * Prix plancher et prix de vente conseillé de chaque produit, d'après son coût de revient, les charges du magasin
 * et le bénéfice visé. Les deux curseurs du haut permettent de simuler sans rien enregistrer.
 */
export default function PvcTable({ rows, pricing, vatRate, averageRevenue, revenueMonths }: { rows: StockRow[]; pricing: PricingSettings; vatRate: number; averageRevenue: number; revenueMonths: number }) {
  const { pending, run } = useAction();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<PriceStatus | "">("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "gap", desc: false });
  // Simulation : valeurs modifiables ici sans toucher aux réglages enregistrés.
  const [target, setTarget] = useState(String(pricing.targetMargin).replace(".", ","));
  const [revenue, setRevenue] = useState(pricing.monthlyRevenue > 0 ? String(pricing.monthlyRevenue) : "");
  const simulated = num(target) !== pricing.targetMargin || num(revenue) !== pricing.monthlyRevenue;
  const [openId, setOpenId] = useState<string | null>(null);
  const trucks = useMemo(() => transportTotals(rows, pricing.transports), [rows, pricing.transports]);
  const opened = openId ? rows.find((row) => row.id === openId) : undefined;

  const settings = useMemo(() => ({ ...pricing, targetMargin: num(target), monthlyRevenue: num(revenue) }), [pricing, target, revenue]);
  const charges = useMemo(() => chargeRate(settings, averageRevenue, vatRate), [settings, averageRevenue, vatRate]);
  const categories = useMemo(() => [...new Set(rows.map((a) => a.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [rows]);

  const computed = useMemo(
    () =>
      rows.map((row) => {
        const advice = recommend(row, charges, settings, vatRate);
        return { row, advice, status: (advice?.status ?? "sans-cout") as PriceStatus, gap: advice && row.price > 0 ? row.price - advice.advisedTtc : null };
      }),
    [rows, charges, settings, vatRate],
  );
  const counts = useMemo(() => {
    const map = new Map<PriceStatus, number>();
    for (const item of computed) map.set(item.status, (map.get(item.status) ?? 0) + 1);
    return map;
  }, [computed]);

  const list = useMemo(() => {
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const value = (item: (typeof computed)[number]): number | string => {
      switch (sort.key) {
        case "name":
          return item.row.name;
        case "cost":
          return item.advice?.cost ?? -Infinity;
        case "floor":
          return item.advice?.floorTtc ?? -Infinity;
        case "advised":
          return item.advice?.advisedTtc ?? -Infinity;
        case "price":
          return item.row.price;
        case "gap":
          // Les plus en dessous du prix conseillé d'abord ; sans calcul possible, en dernier.
          return item.gap ?? (item.advice ? -1e9 + 1 : Infinity);
        case "net":
          return item.advice?.current?.net ?? -Infinity;
      }
    };
    return computed
      .filter(({ row }) => !category || row.category === category)
      .filter((item) => !status || item.status === status)
      .filter(({ row }) => words.every((w) => normalize(`${row.name} ${row.category} ${row.dimensions} ${row.color} ${row.reference} ${row.supplier}`).includes(w)))
      .sort((a, b) => {
        const x = value(a), y = value(b);
        const order = typeof x === "string" ? x.localeCompare(String(y), "fr") : (x as number) - (y as number);
        return (sort.desc ? -order : order) || a.row.name.localeCompare(b.row.name, "fr");
      });
  }, [computed, query, category, status, sort]);

  const withPrice = computed.filter((item) => item.advice?.current);
  // Bénéfice net estimé si toutes les pièces en magasin partent au prix actuel.
  const netStock = withPrice.reduce((t, item) => t + item.advice!.current!.net * (item.row.stock + item.row.reserved), 0);
  const below = (counts.get("perte") ?? 0) + (counts.get("sous-plancher") ?? 0);
  const toFix = computed.filter((item) => item.advice && item.row.price === 0);
  const toRaise = list.filter((item) => item.advice && item.row.price < item.advice.advisedTtc);

  const applyMany = async (items: typeof computed, title: string, message: string) => {
    if (items.length === 0) return;
    if (!(await confirmDialog({ title, message, confirmLabel: "Appliquer les prix" }))) return;
    run(() => applyPrices(items.map((item) => ({ id: item.row.id, price: item.advice!.advisedTtc }))), `${items.length} prix de vente mis à jour`);
  };

  const header = (key: SortKey, label: string, numeric = true) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"} className={`px-2.5 py-2.5 font-medium ${numeric ? "text-right" : ""}`}>
      <button type="button" onClick={() => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: false }))} className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900 ${sort.key === key ? "text-slate-900" : ""}`}>
        {label}
        {sort.key === key ? sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} /> : <ChevronsUpDown size={12} className="text-slate-300" />}
      </button>
    </th>
  );

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile
          label="Charges fixes"
          value={`${eur(charges.monthly)} / mois`}
          hint={
            <Link href="/stock/charges" className="underline underline-offset-2 hover:text-slate-900">
              {pricing.charges.length ? `${pricing.charges.length} ligne${pricing.charges.length > 1 ? "s" : ""} · modifier` : "à renseigner dans « Charges du magasin »"}
            </Link>
          }
        />
        <Tile label="Taux de charges" value={charges.known ? pct(charges.rate) : "—"} hint={charges.known ? `du chiffre d'affaires HT (${eur(charges.revenueHt)} / mois)` : "chiffre d'affaires de référence manquant"} tone={charges.rate >= 0.5 ? "text-rose-700" : ""} />
        <Tile label="Bénéfice net visé" value={pct(num(target) / 100)} hint="du prix de vente HT, charges payées" />
        <Tile label="Sous le prix plancher" value={String(below)} hint={below ? "vendus sans couvrir coût + charges" : "aucun produit ne perd d'argent"} tone={below ? "text-rose-700" : "text-emerald-700"} />
        <Tile label="Bénéfice net du stock" value={withPrice.length ? eur(netStock) : "—"} hint="si tout part au prix actuel, charges déduites" tone={netStock < 0 ? "text-rose-700" : ""} />
      </div>

      <div className="mb-4">
        <ProfitabilityCard rate={charges} grossMarginTarget={pricing.grossMarginTarget} vatRate={vatRate} />
      </div>
      <div className="mb-4">
        <ChargesBreakdown charges={pricing.charges} employerRate={pricing.employerRate}>
          <Link href="/stock/charges" className="text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900">
            Voir et modifier les charges
          </Link>
        </ChargesBreakdown>
      </div>

      {!charges.known ? (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Les charges ne peuvent pas encore être réparties : aucune vente n&apos;est enregistrée et aucun chiffre d&apos;affaires mensuel prévu n&apos;est saisi. Indiquez-le ci-dessous ou dans « Charges du magasin » ; en attendant, les prix sont calculés sans les charges.
        </p>
      ) : null}

      <Card className="mb-4 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Simulateur</h2>
        <p className="mt-0.5 text-xs text-slate-500">Changez ces deux valeurs pour voir l&apos;effet sur tous les prix. Rien n&apos;est enregistré tant que vous n&apos;appliquez pas un prix.</p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-700">Bénéfice net visé (%)</span>
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={50} step={1} aria-label="Bénéfice net visé (curseur)" value={Math.min(50, num(target))} onChange={(e) => setTarget(e.target.value)} className="w-40 accent-black" />
              <input className={`${inputClass} w-20 text-right`} inputMode="decimal" aria-label="Bénéfice net visé (%)" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-700">Chiffre d&apos;affaires {pricing.revenueBasis === "ht" ? "HT" : "TTC"} par mois (€)</span>
            <input className={`${inputClass} w-52`} inputMode="decimal" aria-label="Chiffre d'affaires mensuel simulé" placeholder={averageRevenue > 0 ? `Moyenne réelle : ${eur(averageRevenue)}` : "Ex. : 40 000"} value={revenue} onChange={(e) => setRevenue(e.target.value)} />
          </label>
          {simulated ? (
            <button
              type="button"
              onClick={() => {
                setTarget(String(pricing.targetMargin).replace(".", ","));
                setRevenue(pricing.monthlyRevenue > 0 ? String(pricing.monthlyRevenue) : "");
              }}
              className={buttonSecondary}
            >
              <RotateCcw size={16} /> Revenir aux réglages
            </button>
          ) : null}
        </div>
        {simulated ? <p className="mt-2 text-xs font-medium text-amber-700">Simulation en cours : ces valeurs diffèrent des réglages enregistrés dans « Charges du magasin ».</p> : null}
        {averageRevenue > 0 && !num(revenue) ? <p className="mt-2 text-xs text-slate-500">Base utilisée : la moyenne de vos ventes réelles sur {revenueMonths} mois.</p> : null}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-3 md:px-4">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un produit…" aria-label="Rechercher un produit" className={`${inputClass} pl-9`} />
          </div>
          {categories.length > 0 ? (
            <div className="w-full sm:w-52">
              <select className={inputClass} aria-label="Filtrer par catégorie" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Toutes les catégories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            type="button"
            disabled={pending || toFix.length === 0}
            onClick={() => applyMany(toFix, `Fixer le prix de ${toFix.length} produit${toFix.length > 1 ? "s" : ""} ?`, "Les produits qui n'ont pas encore de prix de vente reçoivent leur prix conseillé. Les produits déjà tarifés ne changent pas.")}
            className={buttonPrimary}
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Fixer les {toFix.length} prix manquants
          </button>
          <button
            type="button"
            disabled={pending || toRaise.length === 0}
            onClick={() => applyMany(toRaise, `Passer ${toRaise.length} produit${toRaise.length > 1 ? "s" : ""} au prix conseillé ?`, "Tous les produits affichés dont le prix actuel est inférieur au prix conseillé seront mis à ce prix. Les bons de commande déjà émis ne changent pas.")}
            className={buttonSecondary}
          >
            <Check size={16} /> Appliquer le conseillé aux {toRaise.length} affichés
          </button>
          <div className="flex w-full flex-wrap items-center gap-2">
            <button type="button" aria-pressed={status === ""} onClick={() => setStatus("")} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${status === "" ? "border-black bg-black text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}>
              Tout <span className={`tabular ${status === "" ? "text-white/70" : "text-slate-400"}`}>{rows.length}</span>
            </button>
            {STATUS_ORDER.filter((key) => counts.get(key)).map((key) => (
              <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${status === key ? "border-black bg-black text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}>
                {STATUS_LABEL[key]} <span className={`tabular ${status === key ? "text-white/70" : "text-slate-400"}`}>{counts.get(key)}</span>
              </button>
            ))}
            <span className="tabular ml-auto text-xs text-slate-500">
              {list.length} produit{list.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {list.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-slate-500">{rows.length === 0 ? "Aucun produit. Ajoutez-les d'abord dans l'onglet Stock." : "Aucun produit ne correspond."}</p>
        ) : (
          <div className="max-h-[calc(100dvh-150px)] min-h-[420px] overflow-auto">
            <table className="w-full min-w-[1320px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 shadow-[0_1px_0_#e2e8f0]">
                <tr>
                  {header("name", "Produit", false)}
                  {header("cost", "Coût de revient")}
                  <th scope="col" className="px-2.5 py-2.5 text-right font-medium">Part de charges</th>
                  {header("floor", "Prix plancher TTC")}
                  {header("advised", "Prix conseillé TTC")}
                  {header("price", "Prix actuel TTC")}
                  {header("gap", "Écart")}
                  {header("net", "Bénéfice net")}
                  <th scope="col" className="px-2.5 py-2.5 font-medium">Situation</th>
                  <th scope="col" className="px-2.5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map(({ row, advice, status: state, gap }) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-2.5 py-2">
                      <button type="button" onClick={() => setOpenId(row.id)} aria-label={`Ouvrir la fiche de ${row.name}`} title="Ouvrir la fiche complète" className="text-left font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900">
                        {row.name}
                      </button>
                      <div className="text-xs text-slate-500">{[row.category, row.dimensions, row.color].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="tabular whitespace-nowrap px-2.5 py-2 text-right text-slate-900">{advice ? eur(advice.cost) : dash}</td>
                    <td className="tabular whitespace-nowrap px-2.5 py-2 text-right text-slate-600">{advice?.current ? eur(advice.current.charges) : advice ? eur(advice.floorHt - advice.cost) : dash}</td>
                    <td className="tabular whitespace-nowrap px-2.5 py-2 text-right">
                      {advice ? (
                        <>
                          <div className="font-medium text-slate-900">{eur(advice.floorTtc)}</div>
                          <div className="text-[11px] text-slate-500">{eur(advice.floorHt)} HT</div>
                        </>
                      ) : (
                        dash
                      )}
                    </td>
                    <td className="tabular whitespace-nowrap px-2.5 py-2 text-right">
                      {advice ? (
                        <>
                          <div className="font-semibold text-slate-900">{eur(advice.advisedTtc)}</div>
                          <div className="text-[11px] text-slate-500">coef. {(advice.advisedTtc / advice.cost).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</div>
                        </>
                      ) : (
                        dash
                      )}
                    </td>
                    <td className="tabular whitespace-nowrap px-2.5 py-1">
                      <div className="flex">
                        <QuickEdit decimal value={row.price} label={`Prix de vente de ${row.name}`} done="Prix de vente enregistré" save={(next) => setArticlePrice(row.id, next)} display={row.price > 0 ? <span className="font-medium text-slate-900">{eur(row.price)}</span> : <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">À fixer</span>} />
                      </div>
                    </td>
                    <td className={`tabular whitespace-nowrap px-2.5 py-2 text-right font-medium ${gap === null ? "" : gap < 0 ? "text-rose-700" : "text-emerald-700"}`}>{gap === null ? dash : `${gap > 0 ? "+" : ""}${eur(gap)}`}</td>
                    <td className="tabular whitespace-nowrap px-2.5 py-2 text-right">
                      {advice?.current ? (
                        <>
                          <div className={`font-semibold ${advice.current.net < 0 ? "text-rose-700" : "text-emerald-700"}`}>{eur(advice.current.net)}</div>
                          <div className="text-[11px] text-slate-500">{pct(advice.current.netRate)} du prix HT</div>
                        </>
                      ) : (
                        dash
                      )}
                    </td>
                    <td className="px-2.5 py-2">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[state]}`}>{STATUS_LABEL[state]}</span>
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      {advice && row.price !== advice.advisedTtc ? (
                        <button type="button" disabled={pending} onClick={() => run(() => setArticlePrice(row.id, advice.advisedTtc), `${row.name} : ${eur(advice.advisedTtc)}`)} aria-label={`Appliquer le prix conseillé à ${row.name}`} className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                          Appliquer
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {opened ? <ProductSheet key={opened.id} row={opened} pricing={settings} vatRate={vatRate} averageRevenue={averageRevenue} trucks={trucks} onClose={() => setOpenId(null)} /> : null}
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Prix plancher : coût de revient ÷ (1 − taux de charges − frais de vente en %). C&apos;est le prix où la vente paie le produit et sa part de charges, sans rien gagner. Prix conseillé : coût de revient ÷ (1 − taux de charges − bénéfice visé), arrondi, puis TVA de {vatRate} %. Un produit
        sans prix d&apos;achat ne peut pas être calculé : renseignez-le dans « Coûts & marges ».
      </p>
    </>
  );
}
